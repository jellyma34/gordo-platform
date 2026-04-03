"""Точка входа для `uvicorn main:app` (Railway, Docker). Приложение FastAPI — в пакете `app`."""

from app.main import app

__all__ = ["app"]
