"""
Alembic environment для ingestion-модуля.

Особенности:
- target_metadata берётся из db.session.Base.metadata — содержит ТОЛЬКО
  таблицы ingestion (префикс ingest_*). Поэтому autogenerate не будет
  пытаться "удалять" таблицы основного backend/app.
- version_table = 'alembic_version_ingestion' — изолировано от других модулей,
  можно безопасно запускать в той же БД, что и backend/app.
- DATABASE_URL берётся из env (IngestionSettings).
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Гарантируем, что `backend/` в sys.path при `cd backend && alembic ...`.
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# ВАЖНО: импортируем модели чтобы Base.metadata был наполнен.
from db.config import settings  # noqa: E402
from db.session import Base  # noqa: E402
import db.models  # noqa: F401,E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Подкладываем URL из IngestionSettings (env), если в ini не задан.
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


# Чтобы autogenerate видел только наши таблицы и не пытался ломать чужие.
def include_object(object_, name, type_, reflected, compare_to):
    if type_ == "table":
        return name.startswith("ingest_")
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table="alembic_version_ingestion",
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table="alembic_version_ingestion",
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
