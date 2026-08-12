"""ТМЦ по частям проекта (residential / parking) — хранение в PostgreSQL с project_id."""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import assert_section_access, get_current_user, require_materials_write
from app.models import Tmc, User
from app.project_ids import normalize_project_id
from app.services.history import append_entity_history
from app.schemas import TmcBulkImportBody, TmcDbItem, TmcItemFull, TmcUpdate

router = APIRouter(prefix="/tmc", tags=["tmc"])

ProjectPartKey = Literal["residential", "parking"]

# Согласовано с models.Tmc / ensure_tmc_varchar_widths()
_TMC_EXTERNAL_ID_MAX = 255
_TMC_NAME_MAX = 1024
_TMC_GPR_STAGE_MAX = 512
_TMC_DATE_MAX = 10


def _tmc_snapshot(t: Tmc) -> dict:
    return {
        "id": t.id,
        "project_id": t.project_id,
        "external_id": t.external_id,
        "project_part": t.project_part,
        "name": t.name,
        "gpr_stage": t.gpr_stage,
        "plan_cost": t.plan_cost,
        "fact_cost": t.fact_cost,
        "plan_date": t.plan_date,
        "fact_date": t.fact_date,
        "details": t.details,
    }


def _to_tmc_item_full(t: Tmc) -> TmcItemFull:
    return TmcItemFull(
        external_id=t.external_id,
        project_part=t.project_part,  # type: ignore[arg-type]
        name=t.name,
        gpr_stage=t.gpr_stage,
        plan_cost=t.plan_cost,
        fact_cost=t.fact_cost,
        plan_date=t.plan_date,
        fact_date=t.fact_date,
        details=t.details if isinstance(t.details, dict) else None,
    )


def _plan_date_from_details(details: dict | list | None, fallback: str) -> str:
    if isinstance(details, dict):
        for key in ("supplyPlanDate", "contractPlanDate", "plan_date"):
            v = details.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return fallback or ""


def _fact_date_from_details(details: dict | list | None) -> str | None:
    if isinstance(details, dict):
        for key in ("supplyFactDate", "contractFactDate", "fact_date"):
            v = details.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _clip_str(value: str | None, max_len: int) -> str:
    s = (value or "").strip() if isinstance(value, str) else ""
    return s if len(s) <= max_len else s[:max_len]


def _clip_date(value: str | None, *, empty_as: str | None) -> str | None:
    """Нормализовать дату под VARCHAR(10): предпочтительно YYYY-MM-DD."""
    if value is None:
        return empty_as
    s = str(value).strip()
    if not s:
        return empty_as
    if len(s) >= 10 and s[4:5] == "-" and s[7:8] == "-":
        return s[:10]
    return s[:_TMC_DATE_MAX]


@router.get("", response_model=list[TmcItemFull])
def list_tmc(
    project_id: str | None = Query(
        None,
        alias="projectId",
        description="Идентификатор проекта (ЖК). По умолчанию — verba-phase-1.",
    ),
    project_part: ProjectPartKey | None = Query(
        None,
        description="Фильтр: residential | parking. Без параметра — все позиции.",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_section_access(user, "materials")
    pid = normalize_project_id(project_id)
    stmt = select(Tmc).where(Tmc.project_id == pid).order_by(Tmc.external_id)
    if project_part is not None:
        stmt = stmt.where(Tmc.project_part == project_part)
    rows = db.scalars(stmt).all()
    return [_to_tmc_item_full(r) for r in rows]


@router.post("/bulk-import", response_model=list[TmcItemFull])
def bulk_import_tmc(
    body: TmcBulkImportBody,
    actor: User = Depends(require_materials_write),
    db: Session = Depends(get_db),
):
    """Массовый upsert ТМЦ (CSV-импорт): ключ (project_id, external_id)."""
    pid = normalize_project_id(getattr(body, "project_id", None) or getattr(body, "projectId", None))
    item_count = len(body.items or [])
    max_ext = max((len((it.external_id or "").strip()) for it in body.items), default=0)
    print(
        f"[TMC bulk-import] projectId={pid!r} items={item_count} "
        f"replace_missing={body.replace_missing!r} max_external_id_len={max_ext} "
        f"actor={getattr(actor, 'email', None)!r}",
        flush=True,
    )
    if body.items:
        first = body.items[0]
        last = body.items[-1]
        print(
            "[TMC bulk-import] first="
            f"ext_len={len((first.external_id or '').strip())} "
            f"name_len={len(first.name or '')} stage_len={len(first.gpr_stage or '')} "
            f"plan_date={first.plan_date!r}",
            flush=True,
        )
        print(
            "[TMC bulk-import] last="
            f"ext_len={len((last.external_id or '').strip())} "
            f"name_len={len(last.name or '')} stage_len={len(last.gpr_stage or '')} "
            f"plan_date={last.plan_date!r}",
            flush=True,
        )

    existing_rows = list(db.scalars(select(Tmc).where(Tmc.project_id == pid)).all())
    existing: dict[str, Tmc] = {r.external_id: r for r in existing_rows if r.external_id}
    seen_ids: set[str] = set()
    now = datetime.now(timezone.utc)

    try:
        for item in body.items:
            external_id = _clip_str(item.external_id, _TMC_EXTERNAL_ID_MAX)
            if not external_id:
                continue
            seen_ids.add(external_id)
            plan_date = _clip_date(
                (item.plan_date or "").strip() or _plan_date_from_details(item.details, ""),
                empty_as="",
            ) or ""
            fact_raw = item.fact_date or _fact_date_from_details(item.details)
            fact_date = _clip_date(fact_raw, empty_as=None)
            name = _clip_str(item.name, _TMC_NAME_MAX) or external_id
            gpr_stage = _clip_str(item.gpr_stage, _TMC_GPR_STAGE_MAX) or ""
            row = existing.get(external_id)
            if row is None:
                row = Tmc(
                    project_id=pid,
                    external_id=external_id,
                    project_part=item.project_part,
                    name=name,
                    gpr_stage=gpr_stage,
                    plan_cost=item.plan_cost,
                    fact_cost=item.fact_cost,
                    plan_date=plan_date,
                    fact_date=fact_date,
                    details=item.details if isinstance(item.details, dict) else None,
                    updated_at=now,
                )
                db.add(row)
                existing[external_id] = row
            else:
                row.project_id = pid
                row.project_part = item.project_part
                row.name = name
                row.gpr_stage = gpr_stage
                row.plan_cost = item.plan_cost
                row.fact_cost = item.fact_cost
                row.plan_date = plan_date
                row.fact_date = fact_date
                row.details = item.details if isinstance(item.details, dict) else row.details
                row.updated_at = now

        if body.replace_missing:
            for ext_id, row in list(existing.items()):
                if ext_id not in seen_ids:
                    db.delete(row)

        db.commit()
    except (DataError, IntegrityError) as e:
        db.rollback()
        orig = getattr(e, "orig", None)
        msg = str(orig or e)
        print(f"[TMC bulk-import] DB error: {type(e).__name__}: {msg}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"TMC bulk-import DB error: {msg}",
        ) from e
    except SQLAlchemyError as e:
        db.rollback()
        print(f"[TMC bulk-import] SQLAlchemyError: {type(e).__name__}: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TMC bulk-import failed: {type(e).__name__}: {e}",
        ) from e
    except Exception as e:
        db.rollback()
        print(f"[TMC bulk-import] Exception: {type(e).__name__}: {e}", flush=True)
        raise

    rows = list(
        db.scalars(select(Tmc).where(Tmc.project_id == pid).order_by(Tmc.external_id)).all()
    )
    print(f"[TMC bulk-import] OK saved={len(seen_ids)} projectId={pid!r}", flush=True)
    return [_to_tmc_item_full(r) for r in rows if r.external_id in seen_ids]


@router.put("/{tmc_id}", response_model=TmcDbItem)
def update_tmc(
    tmc_id: int,
    body: TmcUpdate,
    actor: User = Depends(require_materials_write),
    db: Session = Depends(get_db),
):
    t = db.get(Tmc, tmc_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ТМЦ не найдено")

    append_entity_history(db, _tmc_snapshot(t), actor.id, "tmc")

    payload = body.model_dump()
    for k, v in payload.items():
        setattr(t, k, v)
    t.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(t)
    return t


@router.patch("/{tmc_id}", response_model=TmcDbItem)
def patch_tmc(
    tmc_id: int,
    body: TmcUpdate,
    actor: User = Depends(require_materials_write),
    db: Session = Depends(get_db),
):
    return update_tmc(tmc_id, body, actor, db)


def tmc_row_for_part(db: Session, part_id: int, tmc_id: str, project_id: str | None = None) -> dict[str, str | None] | None:
    """План/факт поставки для блокировки ГПР с учётом части проекта."""
    key: ProjectPartKey = "parking" if part_id == 2 else "residential"
    pid = normalize_project_id(project_id)
    row = db.scalar(
        select(Tmc)
        .where(Tmc.project_id == pid, Tmc.external_id == tmc_id, Tmc.project_part == key)
        .limit(1)
    )
    if row is None:
        return None
    return {
        "name": row.name,
        "plan_date": row.plan_date or None,
        "fact_date": row.fact_date or None,
    }
