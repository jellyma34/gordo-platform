"""
FastAPI приложение ingestion-сервиса.

- main.py    — приложение, CORS, include роутеров
- schemas.py — Pydantic-схемы запросов/ответов
- uploads.py — POST /uploads, GET /uploads, GET /uploads/{id}
- metrics.py — GET /metrics — отдаёт нормализованные fact-данные
- projects.py — GET /projects, POST /projects, POST /projects/{id}/aliases
"""
