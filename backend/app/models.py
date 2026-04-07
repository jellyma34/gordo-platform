from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # admin | manager | employee
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active | blocked
    blocked_reason: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    blocked_by_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    allowed_sections: Mapped[list | None] = mapped_column(JSON, nullable=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    details: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ProjectPart(Base):
    __tablename__ = "project_parts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)


class GprTask(Base):
    __tablename__ = "gpr_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    global_task_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    plan_start: Mapped[str] = mapped_column(String(10), nullable=False)
    plan_end: Mapped[str] = mapped_column(String(10), nullable=False)
    fact_start: Mapped[str | None] = mapped_column(String(10), nullable=True)
    fact_end: Mapped[str | None] = mapped_column(String(10), nullable=True)
    completion: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    related_tmc_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("project_parts.id"), nullable=False, index=True)


class GprRelatedDeviation(Base):
    __tablename__ = "gpr_related_deviations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    global_task_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(64), nullable=False)
    deviation_days: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    link: Mapped[str] = mapped_column(String(255), nullable=False, default="/")


class EntityHistory(Base):
    """История изменений сущности ГПР: снимок до обновления."""

    __tablename__ = "entity_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # entity_id без FK: одна таблица истории для разных сущностей.
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, default="gpr")
    """Тип сущности: gpr | tender | tmc."""
    data: Mapped[dict | list | None] = mapped_column(JSON, nullable=False)
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class GprDataVersion(Base):
    """Устаревшая таблица версий; новые записи пишутся в ``entity_history``."""

    __tablename__ = "gpr_data_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    entity_id: Mapped[int] = mapped_column(ForeignKey("gpr_tasks.id"), nullable=False, index=True)
    data: Mapped[dict | list | None] = mapped_column(JSON, nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_by: Mapped[str | None] = mapped_column(String(320), nullable=True)
