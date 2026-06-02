import copy
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin, require_admin_or_manager, require_gpr_write
from app.models import EntityHistory, GprRelatedDeviation, GprTask, ProjectPart, User
from app.routers.tmc import tmc_row_for_part
from app.services.history import append_entity_history
from app.schemas import (
    EntityHistoryDetail,
    EntityHistoryListItem,
    GprDataVersionDetail,
    GprDataVersionListItem,
    GprTaskCreate,
    GprTaskItem,
    GprTaskUpdate,
    ProjectPartItem,
    RelatedDeviationItem,
)

router = APIRouter(prefix="/gpr", tags=["gpr"])


def _part_kind_from_name(name: str | None) -> str | None:
    n = (name or "").strip().lower()
    if not n:
        return None
    if "жил" in n:
        return "house"
    if "автостоян" in n or "подзем" in n:
        return "parking"
    return None


def _part_kind_from_code(code: str | None) -> str | None:
    c = (code or "").strip()
    if c.startswith("2.06") or c.startswith("2.07"):
        return "parking"
    if c.startswith("2.04") or c.startswith("2.05"):
        return "house"
    return None


def _parts_by_kind(db: Session, kind: str) -> list[ProjectPart]:
    parts = db.scalars(select(ProjectPart).order_by(ProjectPart.id)).all()
    return [p for p in parts if _part_kind_from_name(p.name) == kind]


def _kind_by_part_id(db: Session, part_id: int) -> str | None:
    # API-совместимость: фронт использует стабильные id 1/2 как ключи секций.
    if part_id == 1:
        return "house"
    if part_id == 2:
        return "parking"
    p = db.get(ProjectPart, part_id)
    return _part_kind_from_name(p.name if p else None)


def _kind_by_task(db: Session, task: GprTask) -> str | None:
    # Для изоляции объектов сначала используем part_id (каноничный источник секции).
    by_part = _kind_by_part_id(db, task.part_id)
    if by_part is not None:
        return by_part
    # Fallback только для старых данных без корректного part_id.
    return _part_kind_from_code(task.code)




def _canonical_storage_part_id(db: Session, part_id: int) -> int:
    """Нормализует входной part_id к каноничному id в БД для house/parking."""
    kind = _kind_by_part_id(db, part_id)
    if kind is None:
        return part_id
    candidates = _parts_by_kind(db, kind)
    if not candidates:
        return part_id
    if kind == "parking":
        for p in candidates:
            if "автостоян" in p.name.lower():
                return p.id
    if kind == "house":
        for p in candidates:
            if "жил" in p.name.lower():
                return p.id
    return candidates[0].id


def _canonical_storage_part_id_for_task(db: Session, part_id: int, code: str | None) -> int:
    # Приоритет у явного part_id из UI/импорта. По коду маршрутизируем только когда part_id не распознан.
    by_part = _kind_by_part_id(db, part_id)
    target_kind = by_part or _part_kind_from_code(code)
    if target_kind is not None:
        ids = _parts_by_kind(db, target_kind)
        if ids:
            if target_kind == "parking":
                for p in ids:
                    if "автостоян" in p.name.lower():
                        return p.id
            if target_kind == "house":
                for p in ids:
                    if "жил" in p.name.lower():
                        return p.id
            return ids[0].id
    return _canonical_storage_part_id(db, part_id)


def _response_part_id(db: Session, part_id: int) -> int:
    """Для UI отдаём стабильный ключ секции: 1=house, 2=parking."""
    kind = _kind_by_part_id(db, part_id)
    if kind == "house":
        return 1
    if kind == "parking":
        return 2
    return part_id


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


def _to_task_item(task: GprTask, part_id: int | None = None) -> GprTaskItem:
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
        part_id=part_id if part_id is not None else task.part_id,
        status=status_key,
        blocked_reasons=reasons,
    )


def _task_snapshot(task: GprTask) -> dict:
    return copy.deepcopy(
        {
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
    )


def _apply_snapshot_to_task(task: GprTask, snapshot: dict) -> None:
    """Копирует поля только из ``snapshot`` в ``task`` (одно направление). ``snapshot`` не меняем."""
    if not isinstance(snapshot, dict):
        return
    for field, value in snapshot.items():
        if field == "id":
            continue
        if hasattr(task, field):
            setattr(task, field, value)


def _history_rows_ordered_asc(db: Session, entity_id: int) -> list[EntityHistory]:
    return list(
        db.scalars(
            select(EntityHistory)
            .where(EntityHistory.entity_id == entity_id)
            .order_by(EntityHistory.created_at.asc(), EntityHistory.id.asc())
        ).all()
    )


def _normalize_entity_type(raw: str | None) -> str:
    v = (raw or "gpr").strip().lower()
    return v if v in ("gpr", "tender", "tmc") else "gpr"


def _entity_type_predicate(entity_type: str):
    # Backward-compat: старые записи были со значением "stage" для ГПР
    if entity_type == "gpr":
        return EntityHistory.entity_type.in_(["gpr", "stage"])
    return EntityHistory.entity_type == entity_type


def _version_number_by_history_id(rows_asc: list[EntityHistory]) -> dict[int, int]:
    return {r.id: i + 1 for i, r in enumerate(rows_asc)}


def _user_history_display(u: User | None) -> tuple[str | None, str | None, str]:
    """Имя для UI, email, подпись роли на русском."""
    if u is None:
        return None, None, "Неизвестно"
    name = (u.full_name or "").strip() or None
    display_name = name or u.email
    role_ru = {
        "admin": "Администратор",
        "manager": "Руководитель",
        "employee": "Сотрудник",
    }.get(u.role, u.role)
    return display_name, u.email, role_ru


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
        requested_kind = _kind_by_part_id(db, part_id)
        if requested_kind is not None:
            part_ids = [p.id for p in _parts_by_kind(db, requested_kind)]
            if part_ids:
                stmt = stmt.where(GprTask.part_id.in_(part_ids))
            else:
                stmt = stmt.where(GprTask.part_id == part_id)
        else:
            stmt = stmt.where(GprTask.part_id == part_id)
    rows = db.scalars(stmt).all()
    return [_to_task_item(task, 1 if _kind_by_task(db, task) == "house" else 2 if _kind_by_task(db, task) == "parking" else _response_part_id(db, task.part_id)) for task in rows]


@router.post("/tasks", response_model=GprTaskItem, status_code=status.HTTP_201_CREATED)
def create_gpr_task(
    body: GprTaskCreate,
    actor: User = Depends(require_gpr_write),
    db: Session = Depends(get_db),
):
    canonical_part_id = _canonical_storage_part_id_for_task(db, body.part_id, body.code)
    part = db.get(ProjectPart, canonical_part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Часть проекта не найдена")
    payload = body.model_dump()
    payload["part_id"] = canonical_part_id
    payload["global_task_id"] = payload.get("global_task_id") or body.code
    print(f"[GPR] Creating task: user={actor.email!r} payload={payload}", flush=True)
    task = GprTask(**payload)
    db.add(task)
    db.commit()
    db.refresh(task)
    print(f"[GPR] Created task id={task.id} code={task.code!r}", flush=True)
    return _to_task_item(task, _response_part_id(db, task.part_id))


def read_gpr_task_item_or_404(entity_id: int, db: Session) -> GprTaskItem:
    """Одна задача ГПР из БД (для GET /gpr/tasks/{id} и GET /entity/{id})."""
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    return _to_task_item(task, _response_part_id(db, task.part_id))


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
    actor: User,
) -> GprTaskItem:
    """Эндпоинт обновления этапа: ``PUT /gpr/tasks/{id}`` / ``PUT /entity/{id}``.

    Порядок: актуальная строка из БД → снимок (**старое** состояние) → строка в ``entity_history`` →
    применение полей из тела → один ``commit`` (атомарно).
    """
    task = db.get(GprTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена")
    canonical_part_id = _canonical_storage_part_id_for_task(db, body.part_id, body.code)
    part = db.get(ProjectPart, canonical_part_id)
    if part is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Часть проекта не найдена")
    db.refresh(task)
    print(f"[GPR] Saving task update: entity_id={task_id} user_id={actor.id} email={actor.email!r}", flush=True)
    print(f"[GPR] Data: {body.model_dump()}", flush=True)

    append_entity_history(db, _task_snapshot(task), actor.id, "gpr")

    payload = body.model_dump()
    payload["part_id"] = canonical_part_id
    if not payload.get("global_task_id"):
        payload["global_task_id"] = task.global_task_id or payload["code"]
    for key, value in payload.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    print(f"[GPR] Committed task id={task.id} code={task.code!r}", flush=True)
    return _to_task_item(task, _response_part_id(db, task.part_id))


@router.put("/tasks/{task_id}", response_model=GprTaskItem)
def update_gpr_task(
    task_id: int,
    body: GprTaskUpdate,
    actor: User = Depends(require_gpr_write),
    db: Session = Depends(get_db),
):
    return persist_gpr_task_update(db, task_id, body, actor)


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


def list_entity_history(entity_id: int, entity_type: str, db: Session) -> list[EntityHistoryListItem]:
    """Список записей истории по дате создания (от старых к новым).

    Если задачи с таким ``entity_id`` нет — возвращаем пустой список (не 404), чтобы UI
    не ломался при устаревшем id или рассинхроне клиента и БД.
    """
    et = _normalize_entity_type(entity_type)
    print("HISTORY REQUEST", entity_id, "TYPE", et, flush=True)
    # Для gpr можно вернуть [] если сущности нет; для tender/tmc мы не проверяем gpr_tasks.
    if et == "gpr":
        task = db.get(GprTask, entity_id)
        if task is None:
            return []
    rows = list(
        db.scalars(
            select(EntityHistory)
            .where(EntityHistory.entity_id == entity_id, _entity_type_predicate(et))
            .order_by(EntityHistory.created_at.asc(), EntityHistory.id.asc())
        ).all()
    )
    out: list[EntityHistoryListItem] = []
    for r in rows:
        u = db.get(User, r.changed_by)
        display_name, _, role_ru = _user_history_display(u)
        out.append(
            EntityHistoryListItem(
                id=r.id,
                entity_id=r.entity_id,
                entity_type=r.entity_type,
                changed_by=r.changed_by,
                created_at=r.created_at,
                changed_by_name=display_name,
                changed_by_role=role_ru,
                change_type="Редактирование",
            )
        )
    return out


def get_entity_history_item(entity_id: int, history_id: int, entity_type: str, db: Session) -> EntityHistoryDetail:
    row = db.get(EntityHistory, history_id)
    et = _normalize_entity_type(entity_type)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    if et == "gpr":
        if row.entity_type not in ("gpr", "stage"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    else:
        if row.entity_type != et:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    u = db.get(User, row.changed_by)
    display_name, _, role_ru = _user_history_display(u)
    return EntityHistoryDetail(
        id=row.id,
        entity_id=row.entity_id,
        entity_type=row.entity_type,
        data=row.data,
        changed_by=row.changed_by,
        created_at=row.created_at,
        changed_by_name=display_name,
        changed_by_role=role_ru,
        change_type="Редактирование",
    )


@router.get("/entity/{entity_id}/versions", response_model=list[GprDataVersionListItem])
def list_entity_versions(
    entity_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сущность не найдена")
    rows_asc = _history_rows_ordered_asc(db, entity_id)
    vn = _version_number_by_history_id(rows_asc)
    out: list[GprDataVersionListItem] = []
    for r in reversed(rows_asc):
        u = db.get(User, r.changed_by)
        display_name, email, role_ru = _user_history_display(u)
        out.append(
            GprDataVersionListItem(
                id=r.id,
                entity_id=r.entity_id,
                version_number=vn[r.id],
                created_at=r.created_at,
                changed_by=r.changed_by,
                created_by=email,
                changed_by_name=display_name,
                changed_by_role=role_ru,
                change_type="Редактирование",
            )
        )
    return out


@router.get("/entity/{entity_id}/versions/{version_id}", response_model=GprDataVersionDetail)
def get_entity_version(
    entity_id: int,
    version_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.get(EntityHistory, version_id)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    rows_asc = _history_rows_ordered_asc(db, entity_id)
    vn = _version_number_by_history_id(rows_asc)
    u = db.get(User, row.changed_by)
    display_name, email, role_ru = _user_history_display(u)
    return GprDataVersionDetail(
        id=row.id,
        entity_id=row.entity_id,
        data=row.data,
        version_number=vn[row.id],
        created_at=row.created_at,
        changed_by=row.changed_by,
        created_by=email,
        changed_by_name=display_name,
        changed_by_role=role_ru,
        change_type="Редактирование",
    )


@router.post("/entity/{entity_id}/rollback/{version_id}", response_model=GprTaskItem)
def rollback_entity_version(
    entity_id: int,
    version_id: int,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
    entity_type: str = "gpr",
):
    """Атомарный rollback: apply выбранной версии -> flush task -> запись в history -> commit."""
    task = db.get(GprTask, entity_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сущность не найдена")
    row = db.get(EntityHistory, version_id)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    print("ROLLBACK TO VERSION:", version_id, "TYPE:", entity_type, flush=True)

    db.refresh(task)
    if isinstance(row.data, dict):
        restore_data = json.loads(json.dumps(row.data, default=str))
    else:
        restore_data = {}
    print("RESTORE DATA:", restore_data, flush=True)

    _apply_snapshot_to_task(task, restore_data)
    db.add(task)
    db.flush()

    # Новая запись истории после применения rollback (состояние задачи после отката).
    append_entity_history(db, _task_snapshot(task), actor.id, _normalize_entity_type(entity_type))

    db.commit()
    db.refresh(task)
    return _to_task_item(task, _response_part_id(db, task.part_id))


def delete_entity_history_version(entity_id: int, version_id: int, entity_type: str, db: Session) -> dict[str, str]:
    """Удаляет запись истории только для админа с защитой от критичных случаев."""
    row = db.get(EntityHistory, version_id)
    et = _normalize_entity_type(entity_type)
    if row is None or row.entity_id != entity_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    if et == "gpr":
        if row.entity_type not in ("gpr", "stage"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")
    else:
        if row.entity_type != et:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Версия не найдена")

    rows_asc = _history_rows_ordered_asc(db, entity_id)
    if len(rows_asc) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить единственную версию истории",
        )

    last_id = rows_asc[-1].id
    if row.id == last_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить активную (последнюю) версию истории",
        )

    print("DELETE HISTORY", version_id, flush=True)
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@router.delete("/entity/{entity_id}/history/{version_id}")
def delete_entity_history_item(
    entity_id: int,
    version_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return delete_entity_history_version(entity_id, version_id, "gpr", db)
