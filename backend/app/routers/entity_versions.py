from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin_or_manager, require_gpr_write
from app.models import User
from app.routers.gpr import (
    get_entity_history_item,
    get_entity_version,
    list_entity_history,
    list_entity_versions,
    persist_gpr_task_update,
    read_gpr_task_item_or_404,
    rollback_entity_version,
)
from app.schemas import (
    EntityHistoryDetail,
    EntityHistoryListItem,
    GprDataVersionDetail,
    GprDataVersionListItem,
    GprTaskItem,
    GprTaskUpdate,
)

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


@router.get("/{entity_id}/history/{history_id}", response_model=EntityHistoryDetail)
def get_history_item_alias(
    entity_id: int,
    history_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_entity_history_item(entity_id, history_id, db)


@router.get("/{entity_id}/history", response_model=list[EntityHistoryListItem])
def list_history_alias(
    entity_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_entity_history(entity_id, db)


@router.get("/{entity_id}", response_model=GprTaskItem)
def get_entity(
    entity_id: int,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Текущее состояние сущности ГПР из PostgreSQL (не mock)."""
    return read_gpr_task_item_or_404(entity_id, db)


@router.put("/{entity_id}", response_model=GprTaskItem)
def put_entity(
    entity_id: int,
    body: GprTaskUpdate,
    actor: User = Depends(require_gpr_write),
    db: Session = Depends(get_db),
):
    """Сохранение сущности ГПР (то же, что `PUT /gpr/tasks/{id}`)."""
    return persist_gpr_task_update(db, entity_id, body, actor)
