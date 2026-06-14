from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import assert_section_access, get_current_user, require_tenders_write
from app.models import Tender, User
from app.services.history import append_entity_history
from app.schemas import TenderBulkImportBody, TenderItem, TenderUpdate

router = APIRouter(prefix="/tender", tags=["tender"])


def _tender_snapshot(t: Tender) -> dict:
    return {
        "id": t.id,
        "part_id": t.part_id,
        "code": t.code,
        "name": t.name,
        "stage": t.stage,
        "plan_start": t.plan_start,
        "fact_start": t.fact_start,
        "plan_contract_date": t.plan_contract_date,
        "fact_contract_date": t.fact_contract_date,
        "cost": t.cost,
        "contractor": t.contractor,
        "status": t.status,
        "comment": t.comment,
    }


def _iso_or_empty(value: str | None) -> str:
    return (value or "").strip()


@router.get("", response_model=list[TenderItem])
def list_tenders(
    part_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_section_access(user, "tenders")
    stmt = select(Tender).order_by(Tender.code)
    if part_id is not None:
        stmt = stmt.where(Tender.part_id == part_id)
    return list(db.scalars(stmt).all())


@router.post("/bulk-import", response_model=list[TenderItem])
def bulk_import_tenders(
    body: TenderBulkImportBody,
    actor: User = Depends(require_tenders_write),
    db: Session = Depends(get_db),
):
    """Массовый upsert тендеров (CSV-импорт): ключ (part_id, code)."""
    existing_rows = list(db.scalars(select(Tender)).all())
    existing: dict[tuple[int, str], Tender] = {}
    for row in existing_rows:
        code = (row.code or "").strip()
        if code:
            existing[(row.part_id, code)] = row

    seen_keys: set[tuple[int, str]] = set()

    for item in body.tenders:
        code = (item.code or "").strip()
        if not code:
            continue
        key = (item.part_id, code)
        seen_keys.add(key)
        payload = item.model_dump()
        payload["plan_start"] = _iso_or_empty(payload.get("plan_start"))
        payload["plan_contract_date"] = _iso_or_empty(payload.get("plan_contract_date"))
        tender = existing.get(key)
        if tender is None:
            tender = Tender(**payload)
            db.add(tender)
            existing[key] = tender
        else:
            for field, value in payload.items():
                if field != "id":
                    setattr(tender, field, value)

    if body.replace_missing:
        for key, tender in list(existing.items()):
            if key not in seen_keys:
                db.delete(tender)

    db.commit()
    return list(db.scalars(select(Tender).order_by(Tender.code)).all())


@router.put("/{tender_id}", response_model=TenderItem)
def update_tender(
    tender_id: int,
    body: TenderUpdate,
    actor: User = Depends(require_tenders_write),
    db: Session = Depends(get_db),
):
    t = db.get(Tender, tender_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тендер не найден")

    append_entity_history(db, _tender_snapshot(t), actor.id, "tender")

    payload = body.model_dump()
    for k, v in payload.items():
        setattr(t, k, v)

    db.commit()
    db.refresh(t)
    return t


@router.patch("/{tender_id}", response_model=TenderItem)
def patch_tender(
    tender_id: int,
    body: TenderUpdate,
    actor: User = Depends(require_tenders_write),
    db: Session = Depends(get_db),
):
    return update_tender(tender_id, body, actor, db)
