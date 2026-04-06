from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin_or_manager, require_gpr_write
from app.models import GprDataVersion, GprRelatedDeviation, GprTask, ProjectPart, User
from app.routers.tmc import tmc_row_for_part
from app.schemas import (
    GprDataVersionDetail,
    GprDataVersionListItem,
    GprTaskCreate,
    GprTaskItem,
    GprTaskUpdate,
    ProjectPartItem,
    RelatedDeviationItem,
)

router = APIRouter(prefix="/gpr", tags=["gpr"])


def _parse_iso_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _is_tmc_blocking(tmc: dict[str, str | None], today: date) -> bool:
    plan = _parse_iso_day(tmc.get("plan_date"))
    fact = _parse_iso_day(tmc.get("fact_date"))
    if plan is None:
        return False
    if fact is None and plan < today:
        return True
    if fact is not None and fact > plan:
        return True
    return False


def _task_status_and_reasons(task: GprTask) -> tuple[str, list[str]]:
    today = date.today()
    related_ids = [x for x in (task.related_tmc_ids or []) if isinstance(x, str)]
    reasons: list[str] = []
    for tmc_id in related_ids:
        tmc = tmc_row_for_part(task.part_id, tmc_id)
        if tmc and _is_tmc_blocking(tmc, today):
            reasons.append(str(tmc.get("name") or tmc_id))
    if reasons:
        return "blocked", reasons
    plan_end = _parse_iso_day(task.plan_end)
    fact_end = _parse_iso_day(task.fact_end)
    if plan_end is None:
        return "on_time", []
    baseline = fact_end or today
    delta = (baseline - plan_end).days
    if delta > 14:
        return "overdue", []
    if delta > 0:
        return "risk", []
    return "on_time", []


def _to_task_item(task: GprTask) -> GprTaskItem:
    status_key, reasons = _task_status_and_reasons(task)
    return GprTaskItem(
        id=task.id,
        code=task.code,
        global_task_id=task.global_task_id,
        name=task.name,
        level=task.level,
        plan_start=task.plan_start,
        plan_end=task.plan_end,
        fact_start=task.fact_start,
        fact_end=task.fact_end,
        completion=task.completion,
        comment=task.comment,
        related_tmc_ids=[x for x in (task.related_tmc_ids or []) if isinstance(x, str)],
        part_id=task.part_id,
        status=status_key,
        blocked_reasons=reasons,
    )


def _task_snapshot(task: GprTask) -> dict:
    return {
        "id": task.id,
        "code": task.code,
        "global_task_id": task.global_task_id,
        "name": task.name,
        "level": task.level,
        "plan_start": task.plan_start,
        "plan_end": task.plan_end,
        "fact_start": task.fact_start,
        "fact_end": task.fact_end,
        "completion": task.completion,
        "comment": task.comment,
        "related_tmc_ids": [x for x in (task.related_tmc_ids or []) if isinstance(x, str)],
        "part_id": task.part_id,
    }


def _create_gpr_version(db: Session, task: GprTask, created_by: str | None) -> None:
    last_ver = db.scalar(
        select(func.max(GprDataVersion.version_number)).where(GprDataVersion.entity_id == task.id)
    )
    next_ver = int(last_ver or 0) + 1
    db.add(
        GprDataVersion(
            entity_id=task.id,
            data=_task_snapshot(task),
            version_number=next_ver,
            created_by=created_by,
        )
    )
    db.flush()


@router.get("/parts", response_model=list[ProjectPartItem])
def list_project_parts(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(select(ProjectPart).order_by(ProjectPart.id)).all()


@router.get("/tasks", response_model=list[GprTaskItem])
def list_gpr_tasks(
    part_id: int | None = Query(None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(GprTask).order_by(GprTask.code)
    if part_id is not None:
        stmt = stmt.where(GprTask.part_id == part_id)
    rows = db.scalars(stmt).all()
    return [_to_task_item(task) for task in rows]


@router.post("/tasks", response_model=GprTaskItem, status_code=status.HTTP_201_CREATED)
def create_gpr_task(
    body: GprTaskCreate,
    actor: User = Depends(require_gpr_write),
    db: Session = Depends(get_db),
):
    part = db.get(ProjectPart, body.part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Часть проекта не найдена")
    payload = body.model_dump()
    payload["global_task_id"] = payload.get("global_task_id") or body.code
    print(f"[GPR] Creating task: user={actor.email!r} payload={payload}", flush=True)
    task = GprTask(**payload)
    db.add(task)
    db.commit()
    db.refresh(task)
    print(f"[GPR] Created task id={task.id} code={task.code!r}", flush=True)
    return _to_task_item(task)


def read_gpr_task_item_or_404(entity_id: int, db: Session) -> GprTaskItem:
    """Одна задача ГПР из БД (для GET /gpr/tasks/{id} и GET /entity/{id})."""
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return _to_task_item(task)


@router.get("/tasks/{task_id}", response_model=GprTaskItem)
def get_gpr_task(
    task_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return read_gpr_task_item_or_404(task_id, db)


def persist_gpr_task_update(
    db: Session,
    task_id: int,
    body: GprTaskUpdate,
    actor_email: str | None,
) -> GprTaskItem:
    """Обновление задачи в PostgreSQL: снимок версии → правки → commit + refresh."""
    task = db.get(GprTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    part = db.get(ProjectPart, body.part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Часть проекта не найдена")
    print(f"[GPR] Saving task update: entity_id={task_id} user={actor_email!r}", flush=True)
    print(f"[GPR] Data: {body.model_dump()}", flush=True)
    _create_gpr_version(db, task, actor_email)
    payload = body.model_dump()
    if not payload.get("global_task_id"):
        payload["global_task_id"] = task.global_task_id or payload["code"]
    for key, value in payload.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    print(f"[GPR] Committed task id={task.id} code={task.code!r}", flush=True)
    return _to_task_item(task)


@router.put("/tasks/{task_id}", response_model=GprTaskItem)
def update_gpr_task(
    task_id: int,
    body: GprTaskUpdate,
    actor: User = Depends(require_gpr_write),
    db: Session = Depends(get_db),
):
    return persist_gpr_task_update(db, task_id, body, actor.email)


@router.get("/tasks/{task_id}/related-deviations", response_model=list[RelatedDeviationItem])
def related_deviations(
    task_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(GprTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    rows = db.scalars(
        select(GprRelatedDeviation).where(
            GprRelatedDeviation.global_task_id == task.global_task_id,
            GprRelatedDeviation.section != "ГПР",
        )
    ).all()
    return [RelatedDeviationItem.model_validate(r) for r in rows]


@router.get("/entity/{entity_id}/versions", response_model=list[GprDataVersionListItem])
def list_entity_versions(
    entity_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сущность не найдена")
    rows = db.scalars(
        select(GprDataVersion)
        .where(GprDataVersion.entity_id == entity_id)
        .order_by(GprDataVersion.version_number.desc())
    ).all()
    return [GprDataVersionListItem.model_validate(r) for r in rows]


@router.get("/entity/{entity_id}/versions/{version_id}", response_model=GprDataVersionDetail)
def get_entity_version(
    entity_id: int,
    version_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.get(GprDataVersion, version_id)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    return GprDataVersionDetail.model_validate(row)


@router.post("/entity/{entity_id}/rollback/{version_id}", response_model=GprTaskItem)
def rollback_entity_version(
    entity_id: int,
    version_id: int,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сущность не найдена")
    row = db.get(GprDataVersion, version_id)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")

    # Перед rollback сохраняем текущий снимок как новую версию.
    _create_gpr_version(db, task, actor.email)

    snapshot = row.data if isinstance(row.data, dict) else {}
    task.code = str(snapshot.get("code", task.code))
    task.global_task_id = str(snapshot.get("global_task_id", task.global_task_id))
    task.name = str(snapshot.get("name", task.name))
    task.level = int(snapshot.get("level", task.level))
    task.plan_start = str(snapshot.get("plan_start", task.plan_start))
    task.plan_end = str(snapshot.get("plan_end", task.plan_end))
    task.fact_start = snapshot.get("fact_start")
    task.fact_end = snapshot.get("fact_end")
    task.completion = int(snapshot.get("completion", task.completion))
    task.comment = snapshot.get("comment")
    rel = snapshot.get("related_tmc_ids")
    task.related_tmc_ids = rel if isinstance(rel, list) else []
    task.part_id = int(snapshot.get("part_id", task.part_id))

    db.commit()
    db.refresh(task)
    return _to_task_item(task)
