from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_token

KNOWN_SECTIONS = frozenset({"gpr", "tenders", "materials", "marketing"})
ALL_SECTIONS_ORDERED: list[str] = ["gpr", "tenders", "materials", "marketing"]

security_scheme = HTTPBearer(auto_error=False)


def is_admin(user: User) -> bool:
    return user.role == "admin"


def is_manager(user: User) -> bool:
    """По ТЗ: admin и manager (доступ к панели пользователей с ограничениями для роли manager)."""
    return user.role in ("admin", "manager")


def get_current_user(
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_str = decode_token(creds.credentials)
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный токен",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    if user.status == "blocked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ ограничен. Обратитесь к администратору",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только для администратора")
    return user


def require_admin_or_manager(user: User = Depends(get_current_user)) -> User:
    if not is_manager(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только для администратора или руководителя",
        )
    return user


def require_gpr_write(user: User = Depends(get_current_user)) -> User:
    """Создание и обновление задач ГПР: админ/руководитель или сотрудник с доступом к разделу gpr."""
    if user.role in ("admin", "manager"):
        return user
    assert_section_access(user, "gpr")
    return user


def require_tenders_write(user: User = Depends(get_current_user)) -> User:
    if user.role in ("admin", "manager"):
        return user
    assert_section_access(user, "tenders")
    return user


def require_materials_write(user: User = Depends(get_current_user)) -> User:
    if user.role in ("admin", "manager"):
        return user
    assert_section_access(user, "materials")
    return user


def normalize_allowed_sections(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    return [s for s in raw if s in KNOWN_SECTIONS]


def assert_section_access(user: User, section: str) -> None:
    if section not in KNOWN_SECTIONS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Неизвестный раздел")
    if user.role in ("admin", "manager"):
        return
    allowed = normalize_allowed_sections(user.allowed_sections)
    if section not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к разделу")
