"""Гарантированная синхронизация админ-пользователя при старте приложения."""

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.security import hash_password

_BOOTSTRAP_SECTIONS = ["gpr", "tenders", "materials"]

_ADMIN_EMAIL = "marislova34@gmail.com"
_ADMIN_PASSWORD_PLAIN = "1234"


def bootstrap_admin_if_needed() -> None:
    """
    Если пользователя с email нет — создать; если есть — обновить пароль.
    Пароль хешируется через hash_password (как в admin-роутере и auth).
    """
    email = _ADMIN_EMAIL.lower().strip()
    pwd_hash = hash_password(_ADMIN_PASSWORD_PLAIN)

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
