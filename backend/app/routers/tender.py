from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin_or_manager
from app.models import Tender, User
from app.routers.gpr import _append_entity_history  # reuse universal history writer
from app.schemas import TenderItem, TenderUpdate

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


@router.put("/{tender_id}", response_model=TenderItem)
def update_tender(
    tender_id: int,
    body: TenderUpdate,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    t = db.get(Tender, tender_id)
    if t is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тендер не найден")

    # ДО изменения — история
    _append_entity_history(db, _tender_snapshot(t), actor.id, "tender")

    payload = body.model_dump()
    for k, v in payload.items():
        setattr(t, k, v)

    db.commit()
    db.refresh(t)
    return t

