from typing import Any

from sqlalchemy.orm import Session

from app.models import ActivityLog, User


def log_action(
    db: Session,
    user: User,
    action: str,
    entity: str,
    details: dict[str, Any] | list[Any] | None = None,
) -> None:
    entry = ActivityLog(
        user_email=user.email,
        role=user.role,
        action=action,
        entity=entity,
        details=details,
    )
    db.add(entry)
