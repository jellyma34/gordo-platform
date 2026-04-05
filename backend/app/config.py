from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str = "dev-insecure-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "sqlite:///./gordo.db"

    # Origin страницы в браузере (не URL API). Через запятую; в проде задайте CORS_ORIGINS в Railway.
    # Прод-фронтенд всегда добавляется в app/main.py; здесь — локальная разработка и доп. хосты.
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001"
    )

    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None

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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
