"""
FastAPI entrypoint для ingestion-сервиса.

Запуск:
    cd backend
    uvicorn api.main:app --host 0.0.0.0 --port 8001 --reload

Сервис ingestion работает на отдельном порту от основного GORDO API (8000),
чтобы у них были независимые жизненные циклы и деплой.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.config import settings

from . import metrics as metrics_router
from . import projects as projects_router
from . import uploads as uploads_router


def _cors_allowlist(raw: str) -> tuple[list[str], bool]:
    s = (raw or "*").strip()
    if s == "*":
        return ["*"], False
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        return ["*"], False
    return parts, True


app = FastAPI(
    title="GORDO Ingestion API",
    docs_url="/docs",
    description="Ingestion маркетинговых Excel/CSV файлов (Telegram + REST).",
)


_origins, _credentials = _cors_allowlist(settings.cors_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ingestion"}


app.include_router(uploads_router.router)
app.include_router(metrics_router.router)
app.include_router(projects_router.router)
