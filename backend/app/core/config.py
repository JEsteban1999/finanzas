from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://finanzas:finanzas@localhost:5433/finanzas"
    test_database_url: str = "postgresql+psycopg://finanzas:finanzas@localhost:5433/finanzas_test"
    allowed_origin: str = "http://localhost:3000"
    cookie_secure: bool = False
    session_days: int = 30
    cron_token: str = "dev-cron-token"
    invite_base_url: str = "http://localhost:3000/registro"
    login_rate_limit_per_minute: int = 5
    ai_rate_limit_per_hour: int = 30
    ai_parser: Literal["fake", "claude"] = "fake"
    anthropic_api_key: str | None = None
    claude_model: str = "claude-opus-5-5"
    claude_effort: str | None = "low"
    claude_fallbacks: bool = True
    claude_timeout_seconds: float = 8.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
