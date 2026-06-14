import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import ALL_SECTIONS_ORDERED, get_current_user, normalize_allowed_sections
from app.models import User
from app.security import create_access_token, verify_password

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginUserOut(BaseModel):
    email: str
    role: Literal["admin", "manager", "employee"]
    status: Literal["active", "blocked"] = "active"
    blocked_reason: str | None = None
    allowed_sections: list[str] = Field(default_factory=list)
    fio: str | None = None
    full_name: str | None = None
    fullName: str | None = None


class LoginResponse(BaseModel):
    token: str
    user: LoginUserOut


def _coerce_role(user: User) -> Literal["admin", "manager", "employee"]:
    if user.role in ("admin", "manager", "employee"):
        return user.role
    return "employee"


def _allowed_sections_for_user(user: User) -> list[str]:
    role = _coerce_role(user)
    if role == "employee":
        return normalize_allowed_sections(user.allowed_sections)
    return list(ALL_SECTIONS_ORDERED)


def _login_user_out(user: User) -> LoginUserOut:
    role = _coerce_role(user)
    allowed = _allowed_sections_for_user(user)
    fn = (user.full_name or "").strip() or None
    return LoginUserOut(
        email=user.email,
        role=role,
        status="active",
        blocked_reason=None,
        allowed_sections=allowed,
        fio=fn,
        full_name=fn,
        fullName=fn,
    )


@router.get("/me", response_model=LoginUserOut)
def me(current: User = Depends(get_current_user)) -> LoginUserOut:
    return _login_user_out(current)


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    email_norm = data.email.strip().lower()
    logger.info(
        "POST /auth/login email_norm=%s password_len=%s",
        email_norm,
        len(data.password),
    )
    if settings.login_debug:
        logger.warning("LOGIN_DEBUG enabled: login attempt for email=%s", email_norm)

    user = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if user is None:
        logger.info("POST /auth/login 401: user not found email=%s", email_norm)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if not verify_password(data.password, user.password_hash):
        logger.info("POST /auth/login 401: invalid password email=%s", email_norm)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if user.status == "blocked":
        logger.info("POST /auth/login 403: blocked user email=%s", email_norm)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "blocked_user",
                "message": "Доступ ограничен. Обратитесь к администратору",
                "reason": user.blocked_reason,
            },
        )

    role = _coerce_role(user)

    token = create_access_token(subject=str(user.id))
    logger.info("POST /auth/login 200 email=%s role=%s", email_norm, role)

    return LoginResponse(
        token=token,
        user=_login_user_out(user),
    )
