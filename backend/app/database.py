from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


DATABASE_URL = (settings.database_url or "").strip()
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")
if not DATABASE_URL.startswith("postgresql://"):
    raise ValueError("DATABASE_URL must start with postgresql://")
print(f"Connecting to DB: {DATABASE_URL[:20]}...")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ensure_users_full_name_column() -> None:
    """Без Alembic: добавить колонку users.full_name, если её ещё нет."""
    try:
        insp = inspect(engine)
        if not insp.has_table("users"):
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        if "full_name" in cols:
            return
    except Exception:
        return
    ddl = "ALTER TABLE users ADD COLUMN full_name VARCHAR(512)"
    with engine.begin() as conn:
        conn.execute(text(ddl))


def ensure_users_status_columns() -> None:
    """Без Alembic: добавить колонки блокировки users.*, если их ещё нет."""
    try:
        insp = inspect(engine)
        if not insp.has_table("users"):
            return
        cols = {c["name"] for c in insp.get_columns("users")}
    except Exception:
        return

    ddl: list[str] = []
    if "status" not in cols:
        ddl.append("ALTER TABLE users ADD COLUMN status VARCHAR(16)")
    if "blocked_reason" not in cols:
        ddl.append("ALTER TABLE users ADD COLUMN blocked_reason VARCHAR(1024)")
    if "blocked_at" not in cols:
        ddl.append("ALTER TABLE users ADD COLUMN blocked_at DATETIME")
    if "blocked_by_email" not in cols:
        ddl.append("ALTER TABLE users ADD COLUMN blocked_by_email VARCHAR(320)")
    if not ddl:
        return

    with engine.begin() as conn:
        for sql in ddl:
            conn.execute(text(sql))
        conn.execute(text("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''"))


def ensure_gpr_global_task_id_column() -> None:
    """Без Alembic: добавить колонку gpr_tasks.global_task_id, если её ещё нет."""
    try:
        insp = inspect(engine)
        if not insp.has_table("gpr_tasks"):
            return
        cols = {c["name"] for c in insp.get_columns("gpr_tasks")}
        if "global_task_id" in cols:
            return
    except Exception:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE gpr_tasks ADD COLUMN global_task_id VARCHAR(128)"))
        conn.execute(text("UPDATE gpr_tasks SET global_task_id = code WHERE global_task_id IS NULL"))


def ensure_gpr_related_tmc_ids_column() -> None:
    """Без Alembic: добавить колонку gpr_tasks.related_tmc_ids, если её ещё нет."""
    try:
        insp = inspect(engine)
        if not insp.has_table("gpr_tasks"):
            return
        cols = {c["name"] for c in insp.get_columns("gpr_tasks")}
        if "related_tmc_ids" in cols:
            return
    except Exception:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE gpr_tasks ADD COLUMN related_tmc_ids JSON"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
