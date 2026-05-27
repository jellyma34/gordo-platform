"""
Ingestion module configuration.

Изолирован от backend/app/config.py: ingestion может работать
как отдельный процесс (отдельный FastAPI и/или aiogram bot).
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


_BACKEND_DIR = Path(__file__).resolve().parent.parent  # .../backend


class IngestionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["dev", "staging", "production"] = "dev"

    # Та же база, что у основного backend (Railway PostgreSQL).
    # Ingestion использует собственный SQLAlchemy Base и собственные таблицы,
    # чтобы не пересекаться со схемой существующего GORDO API.
    database_url: str = ""

    # Корень для сырых файлов (telegram uploads и т.п.).
    # По умолчанию — backend/storage/raw, можно переопределить через ENV
    # (например, при монтировании volume в Railway / Docker).
    storage_raw_dir: str = str(_BACKEND_DIR / "storage" / "raw")

    # Telegram bot
    telegram_bot_token: str = ""
    # Список Telegram user_id через запятую — кому разрешено загружать.
    # Пусто = разрешено всем (использовать только в dev).
    telegram_allowed_user_ids: str = ""

    # CORS для ingestion API (отдельно от основного backend).
    cors_origins: str = "*"

    # Лимит размера загружаемого файла (байт). 50 MiB по умолчанию.
    max_upload_bytes: int = 50 * 1024 * 1024

    @property
    def allowed_user_ids(self) -> set[int]:
        raw = (self.telegram_allowed_user_ids or "").strip()
        if not raw:
            return set()
        out: set[int] = set()
        for part in raw.split(","):
            p = part.strip()
            if not p:
                continue
            try:
                out.add(int(p))
            except ValueError:
                continue
        return out


settings = IngestionSettings()
