"""
SQLAlchemy engine + session для ingestion-модуля.

Использует тот же DATABASE_URL, что и основной backend, но
держит собственный DeclarativeBase, чтобы Base.metadata содержала
только ingestion-таблицы — это важно для Alembic autogenerate.
"""
from __future__ import annotations

from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    """Корневой Base только для ingestion-моделей."""


def _build_engine() -> Engine:
    url = (settings.database_url or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL не задан. Установите его в окружении (backend/.env "
            "или Railway Variables) перед запуском ingestion."
        )
    if not url.startswith(("postgresql://", "postgresql+psycopg2://")):
        raise RuntimeError("DATABASE_URL должен начинаться с postgresql://")
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        future=True,
    )


engine: Engine = _build_engine()

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
    future=True,
)


def get_db() -> Iterator[Session]:
    """FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
