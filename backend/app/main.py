import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.bootstrap_admin import bootstrap_admin_if_needed
from app.config import settings
from app.database import (
    Base,
    SessionLocal,
    engine,
    ensure_entity_history_entity_type_column,
    ensure_entity_history_entity_id_fk_dropped,
    ensure_entity_history_table,
    ensure_gpr_global_task_id_column,
    ensure_gpr_plan_dates_nullable,
    ensure_gpr_related_tmc_ids_column,
    ensure_users_status_columns,
    ensure_users_full_name_column,
)
from app.models import ProjectPart
from app.routers import admin, auth as auth_router, debug, entity_versions, gpr, sections, tender, tmc


def ensure_project_parts() -> None:
    db = SessionLocal()
    try:
        existing = set(db.scalars(select(ProjectPart.name)).all())
        for name in ("Жилой дом", "Встроенно-пристроенная автостоянка"):
            if name not in existing:
                db.add(ProjectPart(name=name))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_users_full_name_column()
    ensure_users_status_columns()
    ensure_gpr_global_task_id_column()
    ensure_gpr_plan_dates_nullable()
    ensure_gpr_related_tmc_ids_column()
    ensure_entity_history_table()
    ensure_entity_history_entity_type_column()
    ensure_entity_history_entity_id_fk_dropped()
    ensure_project_parts()
    bootstrap_admin_if_needed()
    print("Backend started", flush=True)
    print("DEPLOY CHECK v2", flush=True)
    print(
        "[API] Admin mounted: GET|POST /api/admin/users | GET /api/admin/logs | … (see ADMIN_API_ROUTES.md)",
        flush=True,
    )
    raw_db = (settings.database_url or "").strip()
    if raw_db:
        try:
            u = urlparse(raw_db)
            safe = f"{u.scheme}://{u.hostname or ''}:{u.port or ''}{u.path or ''}"
            label = "SQLite" if u.scheme.startswith("sqlite") else "PostgreSQL"
            print(f"[DB] Using {label} (sanitized URL, no credentials): {safe}", flush=True)
        except Exception:
            print("[DB] DATABASE_URL is set (could not parse for log)", flush=True)
    yield


app = FastAPI(title="GORDO API", docs_url="/docs", lifespan=lifespan)


def _cors_allowlist(raw: str) -> tuple[list[str], bool]:
    """(origins, allow_credentials). Для credentials нельзя использовать origin="*"."""
    s = (raw or "*").strip()
    if s == "*":
        return ["*"], False
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        return ["*"], False
    return parts, True


_cors_origins, _cors_credentials = _cors_allowlist(settings.cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/test")
def test():
    return {"status": "ok"}


@app.get("/ping")
def ping():
    return {"status": "ok"}


@app.get("/api/status")
def api_status():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"status": "ok"}

# Единый префикс REST. Итог admin: prefix="/api" + router prefix="/admin" + "/users" → /api/admin/users
API_PREFIX = "/api"

app.include_router(auth_router.router, prefix=f"{API_PREFIX}/auth")
# admin.router имеет только prefix="/admin" (не "/api/admin" и не второй "/api").
app.include_router(admin.router, prefix="/api")
app.include_router(tmc.router, prefix=API_PREFIX)
app.include_router(debug.router, prefix=API_PREFIX)
app.include_router(sections.router, prefix=API_PREFIX)
app.include_router(gpr.router, prefix=API_PREFIX)
app.include_router(entity_versions.router, prefix=API_PREFIX)
app.include_router(tender.router, prefix=API_PREFIX)


def _debug_dump_registered_paths() -> None:
    """Диагностика: какие пути реально зарегистрированы при импорте приложения."""
    print("[routes] ----- app.routes -----", flush=True)
    for route in app.routes:
        p = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if isinstance(p, str):
            print(
                f"[routes] {','.join(sorted(methods or [])) or '-':24} {p}",
                flush=True,
            )
        else:
            print(f"[routes] <{type(route).__name__}>", flush=True)
    print("[routes] ----- OpenAPI paths /api/admin* -----", flush=True)
    try:
        for path in sorted(app.openapi()["paths"].keys()):
            if str(path).startswith("/api/admin"):
                print(f"[routes] {path}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[routes] openapi: {exc}", flush=True)
    print("[routes] ----- end -----", flush=True)


# Дамп маршрутов при старте: задать DUMP_APP_ROUTES=1 (в т.ч. на Railway для проверки).
if os.environ.get("DUMP_APP_ROUTES", "").strip() == "1":
    _debug_dump_registered_paths()

