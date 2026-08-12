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


def ensure_gpr_plan_dates_nullable() -> None:
    """Плановые даты могут отсутствовать: снять NOT NULL с plan_start/plan_end (PostgreSQL)."""
    try:
        insp = inspect(engine)
        if not insp.has_table("gpr_tasks"):
            return
    except Exception:
        return
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE gpr_tasks ALTER COLUMN plan_start DROP NOT NULL"))
            conn.execute(text("ALTER TABLE gpr_tasks ALTER COLUMN plan_end DROP NOT NULL"))
    except Exception:
        # Уже nullable или отличия движка — не блокируем старт приложения.
        pass


def ensure_tmc_details_column() -> None:
    """Без Alembic: добавить колонку tmc.details для полной модели ТМЦ (CSV-импорт)."""
    try:
        insp = inspect(engine)
        if not insp.has_table("tmc"):
            return
        cols = {c["name"] for c in insp.get_columns("tmc")}
        if "details" in cols:
            return
    except Exception:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE tmc ADD COLUMN details JSON"))


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


def ensure_entity_history_table() -> None:
    """Без Alembic: универсальная таблица истории изменений (GPR/Tender/TMC)."""
    try:
        insp = inspect(engine)
        if insp.has_table("entity_history"):
            return
        if not insp.has_table("gpr_tasks") or not insp.has_table("users"):
            return
    except Exception:
        return
    # ВАЖНО: entity_id намеренно без FK, чтобы хранить историю разных сущностей в одной таблице.
    ddl = """
    CREATE TABLE IF NOT EXISTS entity_history (
        id SERIAL PRIMARY KEY,
        entity_id INTEGER NOT NULL,
        entity_type VARCHAR(32) NOT NULL DEFAULT 'gpr',
        data JSON NOT NULL,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """
    idx_entity = "CREATE INDEX IF NOT EXISTS ix_entity_history_entity_id ON entity_history (entity_id)"
    idx_user = "CREATE INDEX IF NOT EXISTS ix_entity_history_changed_by ON entity_history (changed_by)"
    with engine.begin() as conn:
        conn.execute(text(ddl))
        conn.execute(text(idx_entity))
        conn.execute(text(idx_user))


def ensure_entity_history_entity_type_column() -> None:
    """Таблица уже есть — добавить колонку entity_type, если её не было."""
    try:
        insp = inspect(engine)
        if not insp.has_table("entity_history"):
            return
        cols = {c["name"] for c in insp.get_columns("entity_history")}
        if "entity_type" in cols:
            return
    except Exception:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE entity_history ADD COLUMN entity_type VARCHAR(32) NOT NULL DEFAULT 'gpr'"
            )
        )


def ensure_tender_cost_numeric_column() -> None:
    """Без Alembic: tenders.cost INTEGER → NUMERIC(20,4) для дробной стоимости."""
    try:
        insp = inspect(engine)
        if not insp.has_table("tenders"):
            return
        col = next((c for c in insp.get_columns("tenders") if c["name"] == "cost"), None)
        if col is None:
            return
        col_type = str(col["type"]).upper()
        if "NUMERIC" in col_type or "DECIMAL" in col_type:
            return
    except Exception:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE tenders ALTER COLUMN cost TYPE NUMERIC(20, 4) "
                "USING cost::numeric(20, 4)"
            )
        )


def ensure_entity_history_entity_id_fk_dropped() -> None:
    """Если таблица была создана со FK на gpr_tasks — убрать его, чтобы history стала универсальной."""
    try:
        insp = inspect(engine)
        if not insp.has_table("entity_history"):
            return
        fks = insp.get_foreign_keys("entity_history") or []
    except Exception:
        return
    for fk in fks:
        constrained = fk.get("constrained_columns") or []
        referred = fk.get("referred_table")
        name = fk.get("name")
        if name and referred == "gpr_tasks" and "entity_id" in constrained:
            try:
                with engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE entity_history DROP CONSTRAINT "{name}"'))
            except Exception:
                pass


def _default_project_id() -> str:
    try:
        from app.project_ids import CANONICAL_DEFAULT_PROJECT_ID

        return CANONICAL_DEFAULT_PROJECT_ID
    except Exception:
        return "verba-phase-1"


def ensure_construction_project_id_columns() -> None:
    """
    Non-destructive: добавить project_id + updated_at в tmc / gpr_tasks / tenders,
    backfill legacy rows → verba-phase-1, перестроить unique на (project_id, …).
    """
    pid = _default_project_id()
    tables = ("tmc", "gpr_tasks", "tenders")
    try:
        insp = inspect(engine)
    except Exception:
        return

    with engine.begin() as conn:
        for table in tables:
            if not insp.has_table(table):
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if "project_id" not in cols:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN project_id VARCHAR(128)")
                )
                conn.execute(
                    text(
                        f"UPDATE {table} SET project_id = :pid "
                        f"WHERE project_id IS NULL OR project_id = '' OR lower(project_id) = 'default'"
                    ),
                    {"pid": pid},
                )
                conn.execute(
                    text(f"ALTER TABLE {table} ALTER COLUMN project_id SET NOT NULL")
                )
            else:
                conn.execute(
                    text(
                        f"UPDATE {table} SET project_id = :pid "
                        f"WHERE project_id IS NULL OR project_id = '' OR lower(project_id) = 'default'"
                    ),
                    {"pid": pid},
                )
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS ix_{table}_project_id ON {table} (project_id)")
            )
            if "updated_at" not in cols:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()")
                )

        # tmc: unique (project_id, external_id) вместо global unique(external_id)
        if insp.has_table("tmc"):
            for uq in insp.get_unique_constraints("tmc") or []:
                cols_uq = list(uq.get("column_names") or [])
                name = uq.get("name")
                if name and cols_uq == ["external_id"]:
                    try:
                        conn.execute(text(f'ALTER TABLE tmc DROP CONSTRAINT "{name}"'))
                    except Exception:
                        pass
            # также index unique на external_id
            for ix in insp.get_indexes("tmc") or []:
                if ix.get("unique") and list(ix.get("column_names") or []) == ["external_id"]:
                    name = ix.get("name")
                    if name:
                        try:
                            conn.execute(text(f'DROP INDEX IF EXISTS "{name}"'))
                        except Exception:
                            pass
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_tmc_project_external "
                    "ON tmc (project_id, external_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_tmc_project_part "
                    "ON tmc (project_id, project_part)"
                )
            )

        if insp.has_table("gpr_tasks"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_gpr_tasks_project_part "
                    "ON gpr_tasks (project_id, part_id)"
                )
            )
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_gpr_project_part_gid "
                        "ON gpr_tasks (project_id, part_id, global_task_id)"
                    )
                )
            except Exception:
                # Дубликаты в legacy-данных — не блокируем старт.
                pass

        if insp.has_table("tenders"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_tenders_project_part "
                    "ON tenders (project_id, part_id)"
                )
            )
            try:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tenders_project_part_code "
                        "ON tenders (project_id, part_id, code)"
                    )
                )
            except Exception:
                pass


def ensure_marketing_imports_table() -> None:
    """Таблица marketing_imports (project_id + kind) — SoT для CSV маркетинга."""
    try:
        insp = inspect(engine)
        if insp.has_table("marketing_imports"):
            return
    except Exception:
        return
    ddl = """
    CREATE TABLE IF NOT EXISTS marketing_imports (
        id SERIAL PRIMARY KEY,
        project_id VARCHAR(128) NOT NULL,
        kind VARCHAR(64) NOT NULL,
        payload JSON NOT NULL,
        raw_csv TEXT,
        file_name VARCHAR(512),
        uploaded_by VARCHAR(320),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_imports_project_kind "
                "ON marketing_imports (project_id, kind)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_marketing_imports_project_id "
                "ON marketing_imports (project_id)"
            )
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
