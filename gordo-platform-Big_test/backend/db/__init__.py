"""
Ingestion DB package.

- session.py — engine / SessionLocal / get_db
- models.py  — SQLAlchemy ORM модели (raw_uploads, staging_marketing_data,
               fact_marketing_metrics, dim_projects, project_aliases,
               parse_error_log)
- config.py  — IngestionSettings (env-based)
"""

from .session import Base, SessionLocal, engine, get_db  # re-export

__all__ = ["Base", "SessionLocal", "engine", "get_db"]
