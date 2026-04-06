from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin_or_manager
from app.models import User
from app.routers.gpr import (
    get_entity_version,
    list_entity_versions,
    rollback_entity_version,
)
from app.schemas import GprDataVersionDetail, GprDataVersionListItem, GprTaskItem

router = APIRouter(prefix="/entity", tags=["entity-versions"])


@router.get("/{entity_id}/versions", response_model=list[GprDataVersionListItem])
def list_versions_alias(
    entity_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_entity_versions(entity_id, user, db)


@router.get("/{entity_id}/versions/{version_id}", response_model=GprDataVersionDetail)
def get_version_alias(
    entity_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_entity_version(entity_id, version_id, user, db)


@router.post("/{entity_id}/rollback/{version_id}", response_model=GprTaskItem)
def rollback_version_alias(
    entity_id: int,
    version_id: int,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    return rollback_entity_version(entity_id, version_id, actor, db)
