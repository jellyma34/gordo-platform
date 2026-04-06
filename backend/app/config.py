from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["dev", "staging", "production"] = "dev"
    secret_key: str = "dev-insecure-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "sqlite:///./gordo.db"

    # Список origin через запятую (например https://app.up.railway.app).
    # "*" — все origin; в этом режиме allow_credentials в CORS будет False (требование браузера).
    cors_origins: str = "*"

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    # По умолчанию на старте только создаём админа, если его нет.
    # Синхронизацию пароля/роли существующего админа включать только вручную.
    bootstrap_admin_sync_on_start: bool = False

    # LOGIN_DEBUG=1 / true — печать в консоль при логине (email, пароль, хеш); только для отладки
    login_debug: bool = False

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
