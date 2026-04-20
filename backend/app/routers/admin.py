from datetime import datetime, timezone

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
from app.models import ActivityLog, GprTask, User
from app.schemas import (
    ActivityLogItem,
    ActivityLogsPage,
    BlockUserRequest,
    CreateUserRequest,
    CreateUserResponse,
    SetPasswordRequest,
    UpdateUserRequest,
    UserAnalyticsResponse,
    UserTaskDeviationItem,
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
        "status": user.status or "active",
        "blocked_reason": user.blocked_reason,
        "blocked_at": user.blocked_at.isoformat() if user.blocked_at else None,
        "blocked_by_email": user.blocked_by_email,
        "allowed_sections": normalize_allowed_sections(user.allowed_sections),
    }


def _deviation_days(plan_end: str | None, fact_end: str | None) -> int | None:
    if not plan_end:
        return None
    try:
        p = datetime.fromisoformat(plan_end).date()
    except ValueError:
        return None
    base = datetime.now(timezone.utc).date()
    if fact_end:
        try:
            base = datetime.fromisoformat(fact_end).date()
        except ValueError:
            pass
    return (base - p).days


def _status_from_deviation(d: int | None) -> str:
    if d is None:
        return "gray"
    if d <= 0:
        return "green"
    if d <= 14:
        return "yellow"
    return "red"


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
            status="blocked" if u.status == "blocked" else "active",  # type: ignore[arg-type]
            blocked_reason=u.blocked_reason,
            blocked_at=u.blocked_at,
            blocked_by_email=u.blocked_by_email,
            allowed_sections=normalize_allowed_sections(u.allowed_sections),
        )
        for u in users
    ]


@router.post("/users", response_model=CreateUserResponse)
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
        status="active",
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
            status="blocked" if user.status == "blocked" else "active",  # type: ignore[arg-type]
            blocked_reason=user.blocked_reason,
            blocked_at=user.blocked_at,
            blocked_by_email=user.blocked_by_email,
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
        status="blocked" if user.status == "blocked" else "active",  # type: ignore[arg-type]
        blocked_reason=user.blocked_reason,
        blocked_at=user.blocked_at,
        blocked_by_email=user.blocked_by_email,
        allowed_sections=allowed,
    )


@router.put("/users/{user_id}/block", response_model=UserListItem)
def block_user(
    user_id: int,
    body: BlockUserRequest,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    if actor.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя заблокировать свою учётную запись")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if is_manager(actor) and not is_admin(actor) and _coerce_role(user.role) == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может блокировать администратора",
        )
    before = _user_snapshot(user)
    user.status = "blocked"
    user.blocked_reason = (body.reason or "").strip() or None
    user.blocked_at = datetime.now(timezone.utc)
    user.blocked_by_email = actor.email
    db.flush()
    after = _user_snapshot(user)
    log_action(
        db,
        actor,
        "update",
        "users",
        {"user_id": user_id, "change": "block", "before": before, "after": after},
    )
    db.commit()
    db.refresh(user)
    return UserListItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=_coerce_role(user.role),  # type: ignore[arg-type]
        status="blocked",  # type: ignore[arg-type]
        blocked_reason=user.blocked_reason,
        blocked_at=user.blocked_at,
        blocked_by_email=user.blocked_by_email,
        allowed_sections=normalize_allowed_sections(user.allowed_sections),
    )


@router.put("/users/{user_id}/unblock", response_model=UserListItem)
def unblock_user(
    user_id: int,
    actor: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if is_manager(actor) and not is_admin(actor) and _coerce_role(user.role) == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Руководитель не может разблокировать администратора",
        )
    before = _user_snapshot(user)
    user.status = "active"
    user.blocked_reason = None
    user.blocked_at = None
    user.blocked_by_email = None
    db.flush()
    after = _user_snapshot(user)
    log_action(
        db,
        actor,
        "update",
        "users",
        {"user_id": user_id, "change": "unblock", "before": before, "after": after},
    )
    db.commit()
    db.refresh(user)
    return UserListItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=_coerce_role(user.role),  # type: ignore[arg-type]
        status="active",  # type: ignore[arg-type]
        blocked_reason=user.blocked_reason,
        blocked_at=user.blocked_at,
        blocked_by_email=user.blocked_by_email,
        allowed_sections=normalize_allowed_sections(user.allowed_sections),
    )


@router.get("/users/{user_id}/analytics", response_model=UserAnalyticsResponse)
def user_analytics(
    user_id: int,
    _: User = Depends(require_admin_or_manager),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    # В текущей модели задачи сотрудника определяются по назначенным разделам.
    allowed = normalize_allowed_sections(user.allowed_sections)
    tasks = db.scalars(select(GprTask).order_by(GprTask.code)).all() if "gpr" in allowed else []

    rows: list[UserTaskDeviationItem] = []
    green = yellow = red = gray = 0
    dev_values: list[int] = []
    completion_sum = 0
    active_tasks = 0
    for t in tasks:
        d = _deviation_days(t.plan_end, t.fact_end)
        st = _status_from_deviation(d)
        if st == "green":
            green += 1
        elif st == "yellow":
            yellow += 1
        elif st == "red":
            red += 1
        else:
            gray += 1
        if d is not None:
            dev_values.append(d)
        c = int(t.completion or 0)
        completion_sum += c
        if c < 100:
            active_tasks += 1
        rows.append(
            UserTaskDeviationItem(
                task_id=t.id,
                code=t.code,
                name=t.name,
                status=st,  # type: ignore[arg-type]
                deviation_days=d,
                completion=c,
            )
        )

    total_tasks = len(tasks)
    completion_percent = round((completion_sum / total_tasks), 1) if total_tasks > 0 else 0.0
    avg_deviation_days = round(sum(dev_values) / len(dev_values), 1) if dev_values else None
    total_for_score = green + yellow + red
    performance_score = (
        round((green + yellow * 0.5) / total_for_score, 3) if total_for_score > 0 else None
    )
    low_efficiency = (red >= max(3, total_tasks // 3) and total_tasks > 0) or (
        performance_score is not None and performance_score < 0.4
    )
    warning = "Низкая эффективность" if low_efficiency else None

    rows.sort(
        key=lambda x: (
            0 if x.status == "red" else 1 if x.status == "yellow" else 2 if x.status == "green" else 3,
            -(x.deviation_days or -9999),
        )
    )

    return UserAnalyticsResponse(
        total_tasks=total_tasks,
        active_tasks=active_tasks,
        completion_percent=completion_percent,
        avg_deviation_days=avg_deviation_days,
        green=green,
        yellow=yellow,
        red=red,
        gray=gray,
        performance_score=performance_score,
        low_efficiency=low_efficiency,
        warning=warning,
        tasks=rows[:20],
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
