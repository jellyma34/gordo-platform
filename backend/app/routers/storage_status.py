"""Диагностика storage без секретов — для Railway / admin."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import distinct, func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.deps import require_admin_or_manager
from app.models import GprTask, MarketingImport, Tender, Tmc, User

router = APIRouter(prefix="/admin", tags=["admin"])


class StorageStatusResponse(BaseModel):
    database_connected: bool
    database_type: str
    environment: str
    construction_storage: str
    marketing_storage: str
    projects_count: int
    tmc_records_count: int
    gpr_records_count: int
    tender_records_count: int
    marketing_records_count: int
    last_tmc_import_at: datetime | None = None
    last_gpr_import_at: datetime | None = None
    last_tender_import_at: datetime | None = None
    last_marketing_import_at: datetime | None = None
    default_project_id: str


@router.get("/storage-status", response_model=StorageStatusResponse)
def storage_status(
    _: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    connected = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        connected = True
    except Exception:
        connected = False

    def _max_updated(model) -> datetime | None:
        try:
            return db.scalar(select(func.max(model.updated_at)))
        except Exception:
            return None

    project_ids: set[str] = set()
    try:
        for col in (Tmc.project_id, GprTask.project_id, Tender.project_id, MarketingImport.project_id):
            for v in db.scalars(select(distinct(col))).all():
                if v:
                    project_ids.add(str(v))
    except Exception:
        pass

    return StorageStatusResponse(
        database_connected=connected,
        database_type="postgresql",
        environment=settings.app_env,
        construction_storage="postgres",
        marketing_storage="postgres",
        projects_count=len(project_ids),
        tmc_records_count=int(db.scalar(select(func.count()).select_from(Tmc)) or 0),
        gpr_records_count=int(db.scalar(select(func.count()).select_from(GprTask)) or 0),
        tender_records_count=int(db.scalar(select(func.count()).select_from(Tender)) or 0),
        marketing_records_count=int(db.scalar(select(func.count()).select_from(MarketingImport)) or 0),
        last_tmc_import_at=_max_updated(Tmc),
        last_gpr_import_at=_max_updated(GprTask),
        last_tender_import_at=_max_updated(Tender),
        last_marketing_import_at=_max_updated(MarketingImport),
        default_project_id=settings.default_project_id or "verba-phase-1",
    )
