"""Точка входа для `uvicorn main:app` (Railway, Docker).

Приложение FastAPI создаётся в `app/main.py`. Роутер авторизации — в `auth.py`,
подключение: `from auth import router as auth_router` и `app.include_router(auth_router)` в `app/main.py`.
"""

from app.main import app

__all__ = ["app"]
