from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["dev", "staging", "production"] = "dev"
    secret_key: str = "dev-insecure-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Обязателен в окружении (Railway Variables), напр. postgresql://...
    database_url: str = ""

    # Список origin через запятую.
    # "*" раскрывается в явный allowlist (Railway frontend + localhost), НЕ в wildcard —
    # иначе с Authorization браузер может показать CORS error вместо реального HTTP status.
    # Рекомендуется на Railway test:
    # CORS_ORIGINS=https://gordo-frontend-test.up.railway.app
    cors_origins: str = "*"

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    # По умолчанию на старте только создаём админа, если его нет.
    # Синхронизацию пароля/роли существующего админа включать только вручную.
    bootstrap_admin_sync_on_start: bool = False

    # LOGIN_DEBUG=1 / true — печать в консоль при логине (email, пароль, хеш); только для отладки
    login_debug: bool = False

    # Канонический project_id для ЖК Верба / 1 очередь (см. app.project_ids).
    default_project_id: str = "verba-phase-1"

    # Опциональный ключ для Next.js → FastAPI (marketing storage без user JWT).
    # Если пусто — marketing endpoints требуют Bearer JWT.
    internal_api_key: str = ""

    @field_validator("login_debug", mode="before")
    @classmethod
    def _coerce_login_debug(cls, v):
        if isinstance(v, bool):
            return v
        if v is None:
            return False
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "on")
        return bool(v)

    @field_validator("bootstrap_admin_sync_on_start", mode="before")
    @classmethod
    def _coerce_bootstrap_sync(cls, v):
        if isinstance(v, bool):
            return v
        if v is None:
            return False
        if isinstance(v, str):
            return v.strip().lower() in ("1", "true", "yes", "on")
        return bool(v)


settings = Settings()
