"""Синхронизация bootstrap-админа из .env при старте и по запросу."""

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.security import hash_password

_BOOTSTRAP_SECTIONS = ["gpr", "tenders", "materials"]


def bootstrap_admin_if_needed() -> None:
    """
    При заданных BOOTSTRAP_ADMIN_EMAIL и BOOTSTRAP_ADMIN_PASSWORD:
    при каждом запуске обновить пароль, роль и разделы существующего пользователя
    или создать нового.
    """
    if not settings.bootstrap_admin_email or not settings.bootstrap_admin_password:
        return

    email = settings.bootstrap_admin_email.lower().strip()
    password_plain = str(settings.bootstrap_admin_password).strip()
    if not email or not password_plain:
        return

    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()

        if user:
            user.password_hash = hash_password(password_plain)
            user.role = "admin"
            user.allowed_sections = list(_BOOTSTRAP_SECTIONS)
        else:
            user = User(
                email=email,
                password_hash=hash_password(password_plain),
                role="admin",
                allowed_sections=list(_BOOTSTRAP_SECTIONS),
            )
            db.add(user)

        db.commit()
        print(f"Bootstrap admin synced: {email}", flush=True)
    finally:
        db.close()
