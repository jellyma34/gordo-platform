"""ТМЦ по частям проекта (residential / parking) — хранение в PostgreSQL."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import assert_section_access, get_current_user, require_materials_write
from app.models import Tmc, User
from app.services.history import append_entity_history
from app.schemas import TmcBulkImportBody, TmcDbItem, TmcItemFull, TmcUpdate

router = APIRouter(prefix="/tmc", tags=["tmc"])

ProjectPartKey = Literal["residential", "parking"]


def _tmc_snapshot(t: Tmc) -> dict:
    return {
        "id": t.id,
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


@router.get("", response_model=list[TmcItemFull])
def list_tmc(
    project_part: ProjectPartKey | None = Query(
        None,
        description="Фильтр: residential | parking. Без параметра — все позиции.",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_section_access(user, "materials")
    stmt = select(Tmc).order_by(Tmc.external_id)
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
    """Массовый upsert ТМЦ (CSV-импорт): ключ external_id."""
    existing_rows = list(db.scalars(select(Tmc)).all())
    existing: dict[str, Tmc] = {r.external_id: r for r in existing_rows if r.external_id}
    seen_ids: set[str] = set()

    for item in body.items:
        external_id = (item.external_id or "").strip()
        if not external_id:
            continue
        seen_ids.add(external_id)
        plan_date = (item.plan_date or "").strip() or _plan_date_from_details(item.details, "")
        fact_date = item.fact_date or _fact_date_from_details(item.details)
        row = existing.get(external_id)
        if row is None:
            row = Tmc(
                external_id=external_id,
                project_part=item.project_part,
                name=item.name,
                gpr_stage=item.gpr_stage,
                plan_cost=item.plan_cost,
                fact_cost=item.fact_cost,
                plan_date=plan_date,
                fact_date=fact_date,
                details=item.details if isinstance(item.details, dict) else None,
            )
            db.add(row)
            existing[external_id] = row
        else:
            row.project_part = item.project_part
            row.name = item.name
            row.gpr_stage = item.gpr_stage
            row.plan_cost = item.plan_cost
            row.fact_cost = item.fact_cost
            row.plan_date = plan_date
            row.fact_date = fact_date
            row.details = item.details if isinstance(item.details, dict) else row.details

    if body.replace_missing:
        for ext_id, row in list(existing.items()):
            if ext_id not in seen_ids:
                db.delete(row)

    db.commit()
    rows = list(db.scalars(select(Tmc).order_by(Tmc.external_id)).all())
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


def tmc_row_for_part(db: Session, part_id: int, tmc_id: str) -> dict[str, str | None] | None:
    """План/факт поставки для блокировки ГПР с учётом части проекта."""
    key: ProjectPartKey = "parking" if part_id == 2 else "residential"
    row = db.scalar(
        select(Tmc).where(Tmc.external_id == tmc_id, Tmc.project_part == key).limit(1)
    )
    if row is None:
        return None
    return {
        "name": row.name,
        "plan_date": row.plan_date or None,
        "fact_date": row.fact_date or None,
    }
