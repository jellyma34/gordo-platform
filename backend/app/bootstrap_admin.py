"""Гарантированная синхронизация админ-пользователя при старте приложения."""

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.security import hash_password

_BOOTSTRAP_SECTIONS = ["gpr", "tenders", "materials"]

_DEFAULT_ADMIN_EMAIL = "marislova34@gmail.com"
_DEFAULT_ADMIN_PASSWORD = "1234"


def bootstrap_admin_if_needed() -> None:
    """
    Если пользователя с email нет — создать; если есть — обновить пароль.
    Пароль хешируется через hash_password (как в admin-роутере и auth).
    На Railway можно задать BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD.
    """
    email = (settings.bootstrap_admin_email or _DEFAULT_ADMIN_EMAIL).lower().strip()
    plain = settings.bootstrap_admin_password or _DEFAULT_ADMIN_PASSWORD
    pwd_hash = hash_password(plain)

    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()

        if user:
            user.password_hash = pwd_hash
            user.role = "admin"
            user.allowed_sections = list(_BOOTSTRAP_SECTIONS)
        else:
            db.add(
                User(
                    email=email,
                    password_hash=pwd_hash,
                    role="admin",
                    allowed_sections=list(_BOOTSTRAP_SECTIONS),
                )
            )

        db.commit()
        print("ADMIN USER READY", flush=True)
    finally:
        db.close()
