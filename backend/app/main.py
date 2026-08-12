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
    ensure_construction_project_id_columns,
    ensure_entity_history_entity_type_column,
    ensure_entity_history_entity_id_fk_dropped,
    ensure_entity_history_table,
    ensure_gpr_global_task_id_column,
    ensure_gpr_plan_dates_nullable,
    ensure_gpr_related_tmc_ids_column,
    ensure_marketing_imports_table,
    ensure_tmc_details_column,
    ensure_tender_cost_numeric_column,
    ensure_users_status_columns,
    ensure_users_full_name_column,
)
from app.models import ProjectPart
from app.routers import (
    admin,
    auth as auth_router,
    debug,
    entity_versions,
    finance,
    gpr,
    marketing,
    sections,
    storage_status,
    tender,
    tmc,
)

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
    ensure_tmc_details_column()
    ensure_tender_cost_numeric_column()
    ensure_entity_history_table()
    ensure_entity_history_entity_type_column()
    ensure_entity_history_entity_id_fk_dropped()
    ensure_construction_project_id_columns()
    ensure_marketing_imports_table()
    ensure_project_parts()
    bootstrap_admin_if_needed()
    print("Backend started", flush=True)
    print("DEPLOY CHECK v2", flush=True)
    raw_db = (settings.database_url or "").strip()
    if raw_db:
        try:
            u = urlparse(raw_db)
            safe = f"{u.scheme}://{u.hostname or ''}:{u.port or ''}{u.path or ''}"
            print(f"[DB] Using PostgreSQL (sanitized URL, no credentials): {safe}", flush=True)
        except Exception:
            print("[DB] DATABASE_URL is set (could not parse for log)", flush=True)
    yield


app = FastAPI(title="GORDO API", docs_url="/docs", lifespan=lifespan)


# Явные origin для JWT/Authorization: wildcard "*" с credentials запрещён браузером
# и маскирует ошибки как CORS, если Origin не отражается.
_BUILTIN_CORS_ORIGINS = (
    "https://gordo-frontend-test.up.railway.app",
    "https://gordo-frontend-production.up.railway.app",
    "https://gordo-frontend-dev.up.railway.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def _cors_allowlist(raw: str) -> tuple[list[str], bool]:
    """(origins, allow_credentials). Для JWT не используем origin='*'."""
    s = (raw or "*").strip()
    if s == "*":
        return list(_BUILTIN_CORS_ORIGINS), True
    parts = [p.strip().rstrip("/") for p in s.split(",") if p.strip()]
    # Не теряем известные Railway frontend, если CORS_ORIGINS задан частично.
    merged: list[str] = []
    seen: set[str] = set()
    for origin in parts + list(_BUILTIN_CORS_ORIGINS):
        if origin and origin not in seen:
            seen.add(origin)
            merged.append(origin)
    if not merged:
        return list(_BUILTIN_CORS_ORIGINS), True
    return merged, True


_cors_origins, _cors_credentials = _cors_allowlist(settings.cors_origins)
print(f"[CORS] allow_origins={_cors_origins!r} allow_credentials={_cors_credentials}", flush=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
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

app.include_router(auth_router.router, prefix="/auth")
app.include_router(tmc.router)
app.include_router(admin.router)
app.include_router(storage_status.router)
app.include_router(debug.router)
app.include_router(sections.router)
app.include_router(gpr.router)
app.include_router(entity_versions.router)
app.include_router(tender.router)
app.include_router(finance.router)
app.include_router(marketing.router)

