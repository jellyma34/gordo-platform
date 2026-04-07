import copy

from sqlalchemy.orm import Session

from app.models import EntityHistory


def append_entity_history(db: Session, snapshot: dict, actor_id: int, entity_type: str) -> None:
    """Универсальная запись истории изменений в EntityHistory.

    snapshot: dict с ключом "id" (entity_id) и остальными полями сущности.
    entity_type: "gpr" | "tender" | "tmc"
    """
    if not isinstance(snapshot, dict):
        return
    entity_id = snapshot.get("id")
    if entity_id is None:
        return

    history = EntityHistory(
        entity_id=int(entity_id),
        entity_type=str(entity_type),
        data=copy.deepcopy(snapshot),
        changed_by=int(actor_id),
    )
    db.add(history)

