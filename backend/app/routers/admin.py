from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit_log import log_action
from app.database import get_db
from app.deps import (
    ALL_SECTIONS_ORDERED,
    KNOWN_SECTIONS,
    is_admin,
    is_manager,
    normalize_allowed_sections,
    require_admin_or_manager,
)
from app.models import ActivityLog, User
from app.schemas import (
    ActivityLogItem,
    ActivityLogsPage,
    CreateUserRequest,
    CreateUserResponse,
    SetPasswordRequest,
    UpdateUserRequest,
    UserListItem,
)
from app.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

_VALID_ROLES = frozenset({"admin", "manager", "employee"})


def _norm_full_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    t = raw.strip()
    return t if t else None


def _coerce_role(raw: str | None) -> str:
    if raw in _VALID_ROLES:
        return raw
    return "employee"


def _validate_sections(sections: list[str]) -> None:
    for s in sections:
        if s not in KNOWN_SECTIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неизвестный раздел: {s}. Допустимо: {sorted(KNOWN_SECTIONS)}",
            )


def _user_snapshot(user: User) -> dict:
    return {
        "email": user.email,
        "full_name": user.full_name,
        "role": _coerce_role(user.role),
        "allowed_sections": normalize_allowed_sections(user.allowed_sections),
    }


@router.get("/logs", response_model=ActivityLogsPage)
def list_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    total = db.scalar(select(func.count()).select_from(ActivityLog)) or 0
    offset = (page - 1) * page_size
    rows = db.scalars(
        select(ActivityLog).order_by(ActivityLog.created_at.desc()).offset(offset).limit(page_size)
    ).all()
    return ActivityLogsPage(
        items=[ActivityLogItem.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/users", response_model=list[UserListItem])
def list_users(
    _: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    users = db.scalars(select(User).order_by(User.email)).all()
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=_coerce_role(u.role),  # type: ignore[arg-type]
            allowed_sections=normalize_allowed_sections(u.allowed_sections),
        )
        for u in users
    ]


@router.post("/create-user", response_model=CreateUserResponse)
def create_user(
    body: CreateUserRequest,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    if is_manager(actor) and not is_admin(actor) and body.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может назначать администраторов",
        )

    email = body.email.lower().strip()
    existing = db.scalars(select(User).where(User.email == email)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с таким email уже есть")

    _validate_sections(body.allowed_sections)

    password = body.password.strip()

    allowed = normalize_allowed_sections(body.allowed_sections)
    if is_manager(actor) and not is_admin(actor) and not allowed:
        allowed = list(ALL_SECTIONS_ORDERED)

    user = User(
        email=email,
        full_name=_norm_full_name(body.full_name),
        password_hash=hash_password(password),
        role=body.role,
        allowed_sections=allowed,
    )
    db.add(user)
    db.flush()
    log_action(
        db,
        actor,
        "create",
        "users",
        {
            "created_user_id": user.id,
            "email": user.email,
            "role": user.role,
            "allowed_sections": allowed,
        },
    )
    db.commit()
    db.refresh(user)

    return CreateUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        allowed_sections=allowed,
    )


@router.put("/users/{user_id}", response_model=UserListItem)
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    _validate_sections(body.allowed_sections)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    manager_only = is_manager(actor) and not is_admin(actor)

    if manager_only and _coerce_role(user.role) == "admin":
        if body.role != "admin" or normalize_allowed_sections(body.allowed_sections) != normalize_allowed_sections(
            user.allowed_sections,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Руководитель не может менять роль или разделы администратора",
            )
        patch = body.model_dump(exclude_unset=True)
        if "full_name" in patch:
            before = _user_snapshot(user)
            user.full_name = _norm_full_name(patch["full_name"])
            db.flush()
            after = _user_snapshot(user)
            log_action(
                db,
                actor,
                "update",
                "users",
                {"user_id": user_id, "before": before, "after": after},
            )
        db.commit()
        db.refresh(user)
        return UserListItem(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=_coerce_role(user.role),  # type: ignore[arg-type]
            allowed_sections=normalize_allowed_sections(user.allowed_sections),
        )

    if manager_only and body.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может назначать администраторов",
        )

    before = _user_snapshot(user)
    allowed = normalize_allowed_sections(body.allowed_sections)
    patch = body.model_dump(exclude_unset=True)
    if "full_name" in patch:
        user.full_name = _norm_full_name(patch["full_name"])
    user.role = body.role
    user.allowed_sections = allowed
    db.flush()
    after = _user_snapshot(user)
    log_action(db, actor, "update", "users", {"user_id": user_id, "before": before, "after": after})
    db.commit()
    db.refresh(user)

    return UserListItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=_coerce_role(user.role),  # type: ignore[arg-type]
        allowed_sections=allowed,
    )


@router.put("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
def set_user_password(
    user_id: int,
    body: SetPasswordRequest,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    if is_manager(actor) and not is_admin(actor) and _coerce_role(user.role) == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может менять пароль администратора",
        )

    password = body.password.strip()
    user.password_hash = hash_password(password)
    log_action(
        db,
        actor,
        "update",
        "users",
        {
            "user_id": user_id,
            "target_email": user.email,
            "change": "password_reset",
        },
    )
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    if actor.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить свою учётную запись")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    if is_manager(actor) and not is_admin(actor) and _coerce_role(user.role) == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может удалить администратора",
        )

    log_action(
        db,
        actor,
        "delete",
        "users",
        {
            "deleted_user_id": user_id,
            "email": user.email,
            "role": _coerce_role(user.role),
        },
    )
    db.delete(user)
    db.commit()
