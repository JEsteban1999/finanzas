from collections.abc import Callable, Iterator
from datetime import datetime
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from alembic import command
from app.auth.service import create_user
from app.core.clock import get_now
from app.core.config import get_settings
from app.core.db import get_db
from app.main import create_app

ORIGIN = "http://localhost:3000"
BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = get_settings().test_database_url
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    eng = create_engine(url)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    outer = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    yield session
    session.close()
    outer.rollback()
    connection.close()


@pytest.fixture
def app(db: Session) -> FastAPI:
    application = create_app()
    application.dependency_overrides[get_db] = lambda: db
    return application


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, headers={"Origin": ORIGIN})


@pytest.fixture
def set_now(app: FastAPI) -> Callable[[datetime], None]:
    def _set(moment: datetime) -> None:
        app.dependency_overrides[get_now] = lambda: moment

    return _set


@pytest.fixture
def make_client(app: FastAPI, db: Session) -> Callable[..., TestClient]:
    def _make(email: str, password: str = "clave-segura-123") -> TestClient:
        create_user(db, email, password, email.split("@")[0])
        new_client = TestClient(app, headers={"Origin": ORIGIN})
        response = new_client.post("/api/auth/login", json={"email": email, "password": password})
        assert response.status_code == 200, response.text
        return new_client

    return _make


@pytest.fixture
def client_a(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client("ana@example.com")


@pytest.fixture
def client_b(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client("beto@example.com")
