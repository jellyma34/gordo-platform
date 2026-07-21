"""Гарантированная синхронизация админ-пользователя при старте приложения."""

from sqlalchemy import func, select

from app.config import settings
from app.database import SessionLocal
from app.models import User
from app.security import hash_password

_BOOTSTRAP_SECTIONS = ["gpr", "tenders", "materials", "marketing"]

# Устаревший placeholder из прошлых .env.example (не второй рабочий логин).
_LEGACY_BOOTSTRAP_EMAILS = ("admin@example.com",)


class BootstrapAdminConfigError(RuntimeError):
    """Некорректные переменные BOOTSTRAP_ADMIN_* для текущего состояния БД."""


def _require_bootstrap_credentials(*, need_password: bool) -> tuple[str, str]:
    email = (settings.bootstrap_admin_email or "").strip().lower()
    password = (settings.bootstrap_admin_password or "").strip()
    if not email:
        raise BootstrapAdminConfigError(
            "BOOTSTRAP_ADMIN_EMAIL не задан. Скопируйте backend/.env.example в backend/.env "
            "и задайте email и пароль начального администратора."
        )
    if need_password and not password:
        raise BootstrapAdminConfigError(
            "BOOTSTRAP_ADMIN_PASSWORD не задан. Укажите пароль в backend/.env "
            "(или включите синхронизацию только после задания пароля)."
        )
    return email, password


def _migrate_legacy_bootstrap_admin(db, target_email: str) -> User | None:
    """Переименовать устаревшего placeholder-admin в канонический email."""
    existing = db.execute(select(User).where(User.email == target_email)).scalar_one_or_none()
    if existing is not None:
        return None
    for legacy in _LEGACY_BOOTSTRAP_EMAILS:
        if legacy == target_email:
            continue
        legacy_user = db.execute(select(User).where(User.email == legacy)).scalar_one_or_none()
        if legacy_user is None or legacy_user.role != "admin":
            continue
        legacy_user.email = target_email
        print(f"bootstrap_admin: миграция admin {legacy} -> {target_email}", flush=True)
        return legacy_user
    return None


def _retire_legacy_bootstrap_admins(db, target_email: str) -> None:
    """Удалить дубликаты placeholder-admin после появления канонического пользователя."""
    target = db.execute(select(User).where(User.email == target_email)).scalar_one_or_none()
    if target is None:
        return
    for legacy in _LEGACY_BOOTSTRAP_EMAILS:
        if legacy == target_email:
            continue
        legacy_user = db.execute(select(User).where(User.email == legacy)).scalar_one_or_none()
        if legacy_user is None or legacy_user.role != "admin":
            continue
        db.delete(legacy_user)
        print(f"bootstrap_admin: удалён устаревший bootstrap-admin {legacy}", flush=True)


def bootstrap_admin_if_needed() -> None:
    """
    Если пользователя с email нет — создать (после миграции с устаревшего placeholder-email).
    Если есть — НЕ изменять пароль/роль по умолчанию (безопасно для staging).
    Принудительная синхронизация существующего admin возможна только через
    BOOTSTRAP_ADMIN_SYNC_ON_START=true.
    """
    db = SessionLocal()
    try:
        email_raw = (settings.bootstrap_admin_email or "").strip().lower()
        if not email_raw:
            admin_count = db.scalar(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            if admin_count and admin_count > 0:
                print(
                    "bootstrap_admin: пропуск (BOOTSTRAP_ADMIN_EMAIL не задан, в БД уже есть admin)",
                    flush=True,
                )
                return
            raise BootstrapAdminConfigError(
                "BOOTSTRAP_ADMIN_EMAIL не задан, а в БД нет администратора. "
                "Задайте BOOTSTRAP_ADMIN_EMAIL и BOOTSTRAP_ADMIN_PASSWORD в backend/.env."
            )

        need_password = settings.bootstrap_admin_sync_on_start
        user = db.execute(select(User).where(User.email == email_raw)).scalar_one_or_none()
        if user is None:
            need_password = True

        email, plain = _require_bootstrap_credentials(need_password=need_password)
        pwd_hash = hash_password(plain)

        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = _migrate_legacy_bootstrap_admin(db, email)

        if user:
            if settings.bootstrap_admin_sync_on_start:
                user.password_hash = pwd_hash
                user.role = "admin"
                user.status = "active"
                user.blocked_reason = None
                user.blocked_at = None
                user.blocked_by_email = None
                user.allowed_sections = list(_BOOTSTRAP_SECTIONS)
                print(f"bootstrap_admin: синхронизирован admin {email}", flush=True)
        else:
            db.add(
                User(
                    email=email,
                    password_hash=pwd_hash,
                    role="admin",
                    status="active",
                    allowed_sections=list(_BOOTSTRAP_SECTIONS),
                )
            )
            print(f"bootstrap_admin: создан admin {email}", flush=True)

        _retire_legacy_bootstrap_admins(db, email)
        db.commit()
        print("ADMIN USER READY", flush=True)
    finally:
        db.close()
