from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_CRON_TOKEN = "dev-cron-token"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production"] = "development"
    database_url: str = "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas"
    test_database_url: str = "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas_test"
    allowed_origin: str = "http://localhost:3000"
    cookie_secure: bool = False
    session_days: int = 30
    cron_token: str = DEV_CRON_TOKEN
    invite_base_url: str = "http://localhost:3000/registro"
    login_rate_limit_per_minute: int = 5
    login_email_rate_limit_per_minute: int = 10
    ai_rate_limit_per_hour: int = 30
    ai_parser: Literal["fake", "claude"] = "fake"
    anthropic_api_key: str | None = None
    claude_model: str = "claude-opus-5-5"
    claude_effort: str | None = "low"
    claude_fallbacks: bool = True
    claude_timeout_seconds: float = 8.0


def validate_production_settings(settings: Settings) -> list[str]:
    if settings.environment != "production":
        return []
    problems = []
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE debe ser true")
    if settings.cron_token == DEV_CRON_TOKEN:
        problems.append("CRON_TOKEN no puede ser el valor de desarrollo")
    if settings.ai_parser != "claude":
        problems.append("AI_PARSER debe ser claude")
    if not settings.anthropic_api_key:
        problems.append("ANTHROPIC_API_KEY es obligatoria")
    return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
