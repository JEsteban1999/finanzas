import pytest

from app.core import config
from app.core.config import Settings, validate_production_settings
from app.main import create_app


def test_development_has_no_checks():
    assert validate_production_settings(Settings(_env_file=None, environment="development")) == []


def test_production_rejects_dev_defaults():
    problems = validate_production_settings(Settings(_env_file=None, environment="production"))
    assert set(problems) == {
        "COOKIE_SECURE debe ser true",
        "CRON_TOKEN no puede ser el valor de desarrollo",
        "AI_PARSER debe ser claude",
        "ANTHROPIC_API_KEY es obligatoria",
    }


def test_production_ok():
    settings = Settings(
        _env_file=None,
        environment="production",
        cookie_secure=True,
        cron_token="un-token-largo-y-aleatorio",
        ai_parser="claude",
        anthropic_api_key="sk-ant-test",
    )
    assert validate_production_settings(settings) == []


def test_create_app_refuses_bad_production_config(monkeypatch):
    monkeypatch.setattr(config.get_settings(), "environment", "production")
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        create_app()
