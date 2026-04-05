from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.bootstrap_admin import bootstrap_admin_if_needed
from app.database import (
    Base,
    SessionLocal,
    engine,
    ensure_gpr_global_task_id_column,
    ensure_gpr_related_tmc_ids_column,
    ensure_users_full_name_column,
)
from app.models import ProjectPart
from app.routers import admin, auth as auth_router, debug, gpr, sections, tmc


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
    ensure_gpr_global_task_id_column()
    ensure_gpr_related_tmc_ids_column()
    ensure_project_parts()
    bootstrap_admin_if_needed()
    print("Backend started", flush=True)
    print("DEPLOY CHECK v2", flush=True)
    yield


app = FastAPI(title="GORDO API", docs_url="/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gordo-frontend-production.up.railway.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
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

app.include_router(auth_router.router, prefix="/auth")
app.include_router(tmc.router)
app.include_router(admin.router)
app.include_router(debug.router)
app.include_router(sections.router)
app.include_router(gpr.router)
