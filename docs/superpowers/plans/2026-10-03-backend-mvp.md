# Backend MVP (FastAPI) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la API FastAPI del MVP de finanzas personales: auth multiusuario, cuentas, categorías, transacciones, presupuestos, "págate primero", recurrentes, dashboard y registro por texto/voz interpretado por Claude.

**Architecture:** Monolito FastAPI organizado por dominio (`app/<dominio>/{models,schemas,service,router}.py`), SQLAlchemy 2 síncrono sobre Postgres, migraciones con Alembic. La lógica de negocio vive en `service.py` (funciones que reciben `Session` y `user_id`); los routers solo traducen HTTP. Claude se usa solo desde `app/ai/`, detrás de los protocolos `TransactionParser` y `JSONCompleter`, con structured outputs (`output_config.format`).

**Tech Stack:** Python 3.12, uv, FastAPI, SQLAlchemy 2 + psycopg 3, Alembic, Pydantic 2 + pydantic-settings, argon2-cffi, anthropic (SDK oficial), pytest + TestClient, ruff, mypy, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-finanzas-personales-design.md`

## Global Constraints

- Dinero: enteros `BIGINT` en pesos COP; nunca `float` para montos. Máximo absoluto `1_000_000_000_000`.
- Fechas de transacciones: `date` sin hora; "hoy" y "este mes" en la zona horaria del usuario (por defecto `America/Bogota`).
- Todo recurso de dominio se filtra por `user_id` tomado de la sesión; recurso ajeno → `404`.
- Formato de error uniforme: `{"error": {"code": "STRING_CODE", "message": "texto", "details": {...}}}`.
- Transacciones `pending` no afectan saldos, presupuestos ni totales del dashboard.
- Transferencias nunca cuentan como ingreso ni egreso.
- La API key de Anthropic solo vive en variables de entorno del backend. Nunca se guarda ni se loguea el texto dictado.
- Rutas públicas bajo `/api/...`; job interno en `/internal/jobs/recurring`; salud en `/health`.
- Contraseñas mínimo 10 caracteres; argon2id.
- Cookie de sesión `session`: `httpOnly`, `SameSite=Lax`, `Secure` en producción, 30 días deslizantes.
- Todos los comandos se ejecutan desde `backend/` salvo que se indique otra cosa.
- TDD: cada tarea escribe el test, lo ve fallar, implementa, lo ve pasar, commitea.

## Review Focus

1. Editar una transacción cambiando su tipo (gasto → transferencia) dejando la categoría vieja debe responder `422 CATEGORY_NOT_ALLOWED`, no un 500 por el `CHECK` de la BD — test en Task 7.
2. Recurrentes con `day_of_month` 29–31 deben caer en el último día de meses cortos y volver al 31 después (31-ene → 28-feb → 31-mar), sin "derivar" al 28 — test en Task 11.
3. Si el cron no corre durante semanas, al volver debe generar cada ocurrencia atrasada exactamente una vez, y correrlo dos veces no duplica — test en Task 11.
4. Frontera de medianoche: a las 23:30 de Bogotá del 31-oct (04:30 UTC del 1-nov) "hoy" es 31-oct tanto para el contexto de IA como para recurrentes — tests en Task 11 y Task 14.
5. Borrar una categoría o cuenta con movimientos, o crear nombres duplicados, debe responder `409` con código claro, no un 500 por restricciones de la BD — tests en Task 5, 6 y 8.

---

## Estructura de archivos

```
.gitignore
docker-compose.yml
docker/init-test-db.sql
.github/workflows/backend-ci.yml
.github/workflows/recurring-cron.yml
backend/
  pyproject.toml, uv.lock, alembic.ini, Dockerfile, .dockerignore, .env.example, README.md
  alembic/env.py, alembic/versions/*.py
  app/
    main.py                  # create_app(): middleware, handlers, routers
    models.py                # importa todos los modelos (para Alembic)
    cli.py                   # invite / reset-password
    core/config.py           # Settings
    core/db.py               # Base, IdTimestampMixin, engine, get_db, get_owned
    core/errors.py           # AppError, handlers
    core/clock.py            # get_now, local_today
    core/months.py           # parse_month, add_months, month_bounds, clamp_day
    core/ratelimit.py        # RateLimiter
    core/security.py         # argon2, tokens
    core/types.py            # Money, Name, Description, MonthStr
    auth/{models,schemas,service,deps,router}.py
    categories/{models,schemas,service,router}.py
    accounts/{models,schemas,service,balances,router}.py
    transactions/{models,schemas,validation,service,router}.py
    budgets/{models,schemas,service,router}.py
    savings/{models,schemas,service,router}.py
    recurring/{models,schemas,schedule,service,router}.py
    dashboard/{schemas,service,router}.py
    ai/{schemas,context,parser,validation,fake,claude,anthropic_completer,deps,router}.py
  evals/{__init__.py,cases.json,run_parser_eval.py}
  tests/conftest.py, tests/factories.py, tests/test_*.py
```

---

### Task 1: Scaffold del backend, Postgres local, infraestructura de tests y CI

**Files:**
- Create: `.gitignore`, `docker-compose.yml`, `docker/init-test-db.sql`
- Create: `backend/pyproject.toml`, `backend/.env.example`
- Create: `backend/app/__init__.py`, `backend/app/core/__init__.py`, `backend/app/core/config.py`, `backend/app/core/db.py`, `backend/app/models.py`, `backend/app/main.py`
- Create: `backend/alembic.ini`, `backend/alembic/env.py` (vía `alembic init`)
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`
- Create: `.github/workflows/backend-ci.yml`

**Interfaces:**
- Produces: `app.core.config.get_settings() -> Settings` (campos listados abajo); `app.core.db.Base`, `IdTimestampMixin` (`id: UUID`, `created_at`, `updated_at`), `engine`, `SessionLocal`, `get_db() -> Iterator[Session]`; `app.main.create_app() -> FastAPI`; fixtures pytest `engine`, `db`, `app`, `client`.

- [ ] **Step 1: Archivos raíz**

`.gitignore`:
```
__pycache__/
*.pyc
.venv/
.env
.mypy_cache/
.ruff_cache/
.pytest_cache/
node_modules/
.next/
```

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: finanzas
      POSTGRES_PASSWORD: finanzas
      POSTGRES_DB: finanzas
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
volumes:
  pgdata:
```

`docker/init-test-db.sql`:
```sql
CREATE DATABASE finanzas_test;
```

Run (desde la raíz): `docker compose up -d db`
Expected: contenedor `db` en estado `running`; `docker compose exec db psql -U finanzas -l` lista `finanzas` y `finanzas_test`.

- [ ] **Step 2: `backend/pyproject.toml` e instalación**

```toml
[project]
name = "finanzas-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0.36",
    "psycopg[binary]>=3.2",
    "alembic>=1.14",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "email-validator>=2.2",
    "argon2-cffi>=23.1",
    "anthropic>=0.69",
    "tzdata>=2024.2",
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
    "ruff>=0.8",
    "mypy>=1.13",
]

[tool.uv]
package = false

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
addopts = "-q"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]
ignore = ["B008", "E501"]

[tool.mypy]
python_version = "3.12"
plugins = ["pydantic.mypy"]
check_untyped_defs = true
ignore_missing_imports = true
```

`tzdata` es obligatorio en Windows para `zoneinfo`. `B008` se ignora porque FastAPI usa `Depends(...)` en defaults; `E501` porque el largo de línea lo resuelve `ruff format`.

Run: `cd backend && uv sync`
Expected: crea `.venv/` y `uv.lock` sin errores.

- [ ] **Step 3: Configuración y BD**

`backend/app/__init__.py` y `backend/app/core/__init__.py`: vacíos.

`backend/app/core/config.py`:
```python
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
```

`backend/app/core/db.py`:
```python
import uuid
from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import DateTime, MetaData, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class IdTimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/app/models.py`:
```python
"""Importa todos los modelos para que Alembic los descubra."""
```

`backend/.env.example`:
```
DATABASE_URL=postgresql+psycopg://finanzas:finanzas@localhost:5433/finanzas
TEST_DATABASE_URL=postgresql+psycopg://finanzas:finanzas@localhost:5433/finanzas_test
ALLOWED_ORIGIN=http://localhost:3000
COOKIE_SECURE=false
CRON_TOKEN=dev-cron-token
AI_PARSER=fake
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-opus-5-5
CLAUDE_EFFORT=low
CLAUDE_FALLBACKS=true
```

- [ ] **Step 4: Alembic**

Run: `uv run alembic init alembic`
Luego en `backend/alembic.ini` deja la línea `sqlalchemy.url =` vacía (borra el valor `driver://...`).

Reemplaza `backend/alembic/env.py` completo:
```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 5: Escribir los tests que fallan**

`backend/tests/__init__.py`: vacío.

`backend/tests/conftest.py`:
```python
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

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
```

`backend/tests/test_health.py`:
```python
from sqlalchemy import text


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_db_session_works(db):
    assert db.execute(text("SELECT 1")).scalar_one() == 1
```

- [ ] **Step 6: Ver que fallan**

Run: `uv run pytest tests/test_health.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 7: Implementación mínima**

`backend/app/main.py`:
```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Finanzas API")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 8: Ver que pasan**

Run: `uv run pytest tests/test_health.py -v`
Expected: 2 passed.

- [ ] **Step 9: CI**

`.github/workflows/backend-ci.yml`:
```yaml
name: backend
on:
  push:
    paths: ["backend/**", ".github/workflows/backend-ci.yml"]
  pull_request:
    paths: ["backend/**", ".github/workflows/backend-ci.yml"]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: finanzas
          POSTGRES_PASSWORD: finanzas
          POSTGRES_DB: finanzas_test
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U finanzas"
          --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy app
      - run: uv run pytest
```

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app`
Expected: sin errores (si `ruff format --check` se queja, corre `uv run ruff format .`).

- [ ] **Step 10: Commit**

```bash
git add .gitignore docker-compose.yml docker .github backend
git commit -m "chore: scaffold FastAPI backend with Postgres, Alembic, pytest and CI"
```

---

### Task 2: Utilidades core — errores, reloj, meses, tipos

**Files:**
- Create: `backend/app/core/errors.py`, `backend/app/core/clock.py`, `backend/app/core/months.py`, `backend/app/core/types.py`
- Modify: `backend/app/core/db.py` (agregar `get_owned`)
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_core.py`

**Interfaces:**
- Produces:
  - `AppError(status_code: int, code: str, message: str, details: dict | None = None)`; `error_body(code, message, details=None) -> dict`; `register_error_handlers(app)`.
  - `get_now() -> datetime` (dependencia FastAPI, UTC aware); `utcnow() -> datetime`; `local_today(now: datetime, tz: str) -> date`.
  - `parse_month(value: str) -> date` (lanza `AppError(422, "INVALID_MONTH")`); `format_month(d) -> "YYYY-MM"`; `month_start(d) -> date`; `add_months(month_start, n) -> date`; `month_bounds(month_start) -> (inicio, inicio_mes_siguiente)`; `clamp_day(year, month, day) -> date`.
  - Tipos: `MAX_AMOUNT`, `Money` (int >0), `SignedMoney`, `Name` (1–60, strip), `Description` (≤200, strip), `MonthStr` (`^\d{4}-\d{2}$`).
  - `get_owned(db, model, obj_id, user_id, code) -> obj` (lanza `AppError(404, code)`).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_core.py`:
```python
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.clock import local_today
from app.core.errors import AppError, register_error_handlers
from app.core.months import add_months, clamp_day, format_month, month_bounds, parse_month
from app.core.types import Money


def test_parse_month_valid():
    assert parse_month("2026-10") == date(2026, 10, 1)


@pytest.mark.parametrize("value", ["2026-13", "2026-1", "26-10", "octubre", ""])
def test_parse_month_invalid(value):
    with pytest.raises(AppError) as exc:
        parse_month(value)
    assert exc.value.status_code == 422
    assert exc.value.code == "INVALID_MONTH"


def test_add_months_crosses_years():
    assert add_months(date(2026, 11, 1), 3) == date(2027, 2, 1)
    assert add_months(date(2026, 1, 1), -1) == date(2025, 12, 1)


def test_month_bounds_and_format():
    assert month_bounds(date(2026, 12, 1)) == (date(2026, 12, 1), date(2027, 1, 1))
    assert format_month(date(2026, 3, 1)) == "2026-03"


def test_clamp_day_short_months():
    assert clamp_day(2026, 2, 31) == date(2026, 2, 28)
    assert clamp_day(2028, 2, 31) == date(2028, 2, 29)
    assert clamp_day(2026, 4, 31) == date(2026, 4, 30)
    assert clamp_day(2026, 3, 31) == date(2026, 3, 31)


def test_local_today_uses_timezone():
    now = datetime(2026, 11, 1, 4, 30, tzinfo=UTC)  # 23:30 del 31-oct en Bogotá
    assert local_today(now, "America/Bogota") == date(2026, 10, 31)
    assert local_today(now, "UTC") == date(2026, 11, 1)


class _Body(BaseModel):
    amount: Money


def _error_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise AppError(409, "SOMETHING_TAKEN", "Ya existe", {"field": "name"})

    @app.post("/body")
    def body(payload: _Body) -> dict[str, int]:
        return {"amount": payload.amount}

    return app


def test_app_error_format():
    response = TestClient(_error_app()).get("/boom")
    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "SOMETHING_TAKEN", "message": "Ya existe", "details": {"field": "name"}}
    }


def test_validation_error_format():
    response = TestClient(_error_app()).post("/body", json={"amount": 0})
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["details"]["errors"][0]["loc"] == ["body", "amount"]


def test_not_found_route_format():
    response = TestClient(_error_app()).get("/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "HTTP_404"
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_core.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.core.clock'`.

- [ ] **Step 3: Implementación**

`backend/app/core/errors.py`:
```python
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{k: v for k, v in e.items() if k != "ctx"} for e in exc.errors()]
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR", "Datos inválidos", {"errors": jsonable_encoder(errors)}
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(f"HTTP_{exc.status_code}", str(exc.detail)),
        )
```

`backend/app/core/clock.py`:
```python
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(UTC)


def get_now() -> datetime:
    """Dependencia FastAPI; los tests la sobreescriben para fijar el reloj."""
    return utcnow()


def local_today(now: datetime, tz: str) -> date:
    return now.astimezone(ZoneInfo(tz)).date()
```

`backend/app/core/months.py`:
```python
import calendar
from datetime import date

from app.core.errors import AppError


def parse_month(value: str) -> date:
    try:
        year_s, month_s = value.split("-")
        if len(year_s) != 4 or len(month_s) != 2:
            raise ValueError(value)
        return date(int(year_s), int(month_s), 1)
    except ValueError as exc:
        raise AppError(422, "INVALID_MONTH", "Mes inválido, usa AAAA-MM") from exc


def format_month(month: date) -> str:
    return f"{month.year:04d}-{month.month:02d}"


def month_start(day: date) -> date:
    return day.replace(day=1)


def add_months(month: date, n: int) -> date:
    index = month.year * 12 + (month.month - 1) + n
    return date(index // 12, index % 12 + 1, 1)


def month_bounds(month: date) -> tuple[date, date]:
    return month, add_months(month, 1)


def clamp_day(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))
```

`backend/app/core/types.py`:
```python
from typing import Annotated

from pydantic import Field, StringConstraints

MAX_AMOUNT = 1_000_000_000_000

Money = Annotated[int, Field(gt=0, le=MAX_AMOUNT)]
SignedMoney = Annotated[int, Field(ge=-MAX_AMOUNT, le=MAX_AMOUNT)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
MonthStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}$")]
```

Reemplaza `backend/app/core/db.py` completo (agrega `get_owned`):
```python
import uuid
from collections.abc import Iterator
from datetime import datetime
from typing import Any, TypeVar

from sqlalchemy import DateTime, MetaData, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings
from app.core.errors import AppError

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

T = TypeVar("T")


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class IdTimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_owned(db: Session, model: type[T], obj_id: uuid.UUID, user_id: uuid.UUID, code: str) -> T:
    obj: Any = db.get(model, obj_id)
    if obj is None or obj.user_id != user_id:
        raise AppError(404, code, "No encontrado")
    return obj  # type: ignore[no-any-return]
```

`backend/app/main.py` completo:
```python
from fastapi import FastAPI

from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Finanzas API")
    register_error_handlers(app)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 4: Ver que pasan**

Run: `uv run ruff check --fix . && uv run pytest -v`
Expected: todos pasan (test_core + test_health).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(core): add error format, clock, month helpers and shared types"
```

---

### Task 3: Usuarios, invitaciones, sesiones (modelos), seguridad y CLI

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/auth/__init__.py`, `backend/app/auth/models.py`, `backend/app/auth/service.py`
- Create: `backend/app/cli.py`
- Modify: `backend/app/models.py`
- Create: migración `backend/alembic/versions/<rev>_auth.py` (autogenerada)
- Test: `backend/tests/test_security.py`, `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: `Base`, `IdTimestampMixin`, `AppError`, `utcnow`, `get_settings`.
- Produces:
  - `hash_password(p) -> str`, `verify_password(hash, p) -> bool`, `new_token() -> str`, `hash_token(t) -> str` (sha256 hex), `DUMMY_HASH`.
  - Modelos `User` (`email`, `password_hash`, `display_name`, `timezone`, `is_active`), `Invitation` (`email`, `token_hash`, `expires_at`, `used_at`), `UserSession` (tabla `sessions`: `user_id`, `token_hash`, `expires_at`, `revoked_at`, `user_agent`).
  - `normalize_email(email) -> str`; `create_user(db, email, password, display_name) -> User` (409 `EMAIL_TAKEN`); `create_invitation(db, email, now, valid_days=7) -> str` (token en claro); `reset_password(db, email, now) -> str` (contraseña temporal; revoca sesiones; 404 `USER_NOT_FOUND`).
  - `app.cli.main(argv: list[str] | None = None, db: Session | None = None) -> int`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_security.py`:
```python
from app.core.security import hash_password, hash_token, new_token, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("clave-segura-123")
    assert hashed != "clave-segura-123"
    assert verify_password(hashed, "clave-segura-123")
    assert not verify_password(hashed, "otra-clave-123")


def test_verify_password_with_garbage_hash_is_false():
    assert not verify_password("no-es-un-hash", "lo-que-sea")


def test_tokens_are_unique_and_hash_is_deterministic():
    a, b = new_token(), new_token()
    assert a != b
    assert len(a) >= 40
    assert hash_token(a) == hash_token(a)
    assert hash_token(a) != hash_token(b)
    assert len(hash_token(a)) == 64
```

`backend/tests/test_auth_service.py`:
```python
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.auth.models import Invitation, UserSession
from app.auth.service import create_invitation, create_user
from app.cli import main
from app.core.errors import AppError
from app.core.security import hash_token, verify_password

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_create_user_normalizes_email(db):
    user = create_user(db, "  Ana@Example.COM ", "clave-segura-123", "Ana")
    assert user.email == "ana@example.com"
    assert user.timezone == "America/Bogota"
    assert user.is_active


def test_create_user_duplicate_email(db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    with pytest.raises(AppError) as exc:
        create_user(db, "ANA@example.com", "clave-segura-456", "Ana 2")
    assert exc.value.status_code == 409
    assert exc.value.code == "EMAIL_TAKEN"


def test_create_invitation_stores_only_hash(db):
    token = create_invitation(db, "Nueva@Example.com", NOW)
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    assert inv is not None
    assert inv.email == "nueva@example.com"
    assert inv.used_at is None
    assert (inv.expires_at - NOW).days == 7


def test_cli_invite_prints_link(db, capsys):
    assert main(["invite", "Nueva@Example.com"], db=db) == 0
    out = capsys.readouterr().out.strip()
    assert out.startswith("http://localhost:3000/registro?token=")
    token = out.split("token=")[1]
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    assert inv is not None and inv.email == "nueva@example.com"


def test_cli_reset_password_sets_temp_password_and_revokes_sessions(db, capsys):
    user = create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    db.add(UserSession(user_id=user.id, token_hash="x" * 64, expires_at=NOW))
    db.commit()
    assert main(["reset-password", "ana@example.com"], db=db) == 0
    temp = capsys.readouterr().out.strip().split(": ")[-1]
    db.refresh(user)
    assert len(temp) >= 10
    assert verify_password(user.password_hash, temp)
    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None and session.revoked_at is not None


def test_cli_reset_password_unknown_user(db, capsys):
    assert main(["reset-password", "nadie@example.com"], db=db) == 1
    assert "Usuario no encontrado" in capsys.readouterr().err
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_security.py tests/test_auth_service.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 3: Seguridad y modelos**

`backend/app/core/security.py`:
```python
import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


DUMMY_HASH = hash_password("dummy-password-for-timing")
```

`backend/app/auth/__init__.py`: vacío.

`backend/app/auth/models.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class User(IdTimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(64), default="America/Bogota")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Invitation(IdTimestampMixin, Base):
    __tablename__ = "invitations"

    email: Mapped[str] = mapped_column(String(320))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserSession(IdTimestampMixin, Base):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
```

`backend/app/models.py`:
```python
"""Importa todos los modelos para que Alembic los descubra."""

from app.auth.models import Invitation, User, UserSession

__all__ = ["Invitation", "User", "UserSession"]
```

- [ ] **Step 4: Servicio y CLI**

`backend/app/auth/service.py`:
```python
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.models import Invitation, User, UserSession
from app.core.errors import AppError
from app.core.security import hash_password, hash_token, new_token


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_user(db: Session, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(409, "EMAIL_TAKEN", "Ya existe un usuario con ese email")
    user = User(email=email, password_hash=hash_password(password), display_name=display_name)
    db.add(user)
    db.flush()
    db.commit()
    return user


def create_invitation(db: Session, email: str, now: datetime, valid_days: int = 7) -> str:
    token = new_token()
    db.add(
        Invitation(
            email=normalize_email(email),
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=valid_days),
        )
    )
    db.commit()
    return token


def reset_password(db: Session, email: str, now: datetime) -> str:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "Usuario no encontrado")
    temporary = new_token()[:16]
    user.password_hash = hash_password(temporary)
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
    return temporary
```

`backend/app/cli.py`:
```python
import argparse
import sys

from sqlalchemy.orm import Session

from app.auth.service import create_invitation, reset_password
from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    invite = sub.add_parser("invite", help="Crea una invitación y muestra el enlace")
    invite.add_argument("email")
    reset = sub.add_parser("reset-password", help="Asigna una contraseña temporal")
    reset.add_argument("email")
    return parser


def main(argv: list[str] | None = None, db: Session | None = None) -> int:
    args = _parser().parse_args(argv)
    owns_session = db is None
    session = db if db is not None else SessionLocal()
    try:
        if args.command == "invite":
            token = create_invitation(session, args.email, utcnow())
            print(f"{get_settings().invite_base_url}?token={token}")
        else:
            temporary = reset_password(session, args.email, utcnow())
            print(f"Contraseña temporal para {args.email}: {temporary}")
        return 0
    except AppError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    finally:
        if owns_session:
            session.close()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Migración**

Run:
```bash
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "auth tables"
```
Expected: un archivo nuevo en `alembic/versions/` con `op.create_table("users", ...)`, `"invitations"`, `"sessions"`, el índice `ix_sessions_user_id` y los `unique` de `email` y `token_hash`. Revísalo; luego `uv run alembic upgrade head`.

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(auth): add user, invitation and session models, password hashing and admin CLI"
```

---

### Task 4: Endpoints de autenticación, sesión por cookie, CSRF por Origin, rate limit de login

**Files:**
- Create: `backend/app/core/ratelimit.py`
- Create: `backend/app/auth/schemas.py`, `backend/app/auth/deps.py`, `backend/app/auth/router.py`
- Modify: `backend/app/auth/service.py`, `backend/app/main.py`, `backend/tests/conftest.py`
- Test: `backend/tests/test_ratelimit.py`, `backend/tests/test_auth_api.py`

**Interfaces:**
- Consumes: Task 3 completo; `get_now`, `AppError`, `error_body`.
- Produces:
  - `RateLimiter(limit: int, window_seconds: float).hit(key: str, now: float) -> bool`.
  - `register_with_invitation(db, token, password, display_name, now) -> User` (400 `INVALID_INVITATION`); `authenticate(db, email, password) -> User | None`; `create_session(db, user, now, user_agent) -> str`; `resolve_session(db, token, now) -> User | None`; `revoke_session(db, token, now) -> None`.
  - `SESSION_COOKIE = "session"`; `get_current_user(...) -> User` (401 `NOT_AUTHENTICATED`).
  - Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. `UserOut {id, email, display_name, timezone}`.
  - `app.state.login_limiter`, `app.state.ai_limiter`.
  - Fixtures: `make_client(email, password="clave-segura-123") -> TestClient` (usuario creado y logueado), `client_a`, `client_b`, `set_now(datetime)`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_ratelimit.py`:
```python
from app.core.ratelimit import RateLimiter


def test_rate_limiter_blocks_after_limit_and_recovers():
    limiter = RateLimiter(limit=2, window_seconds=60)
    assert limiter.hit("k", 0.0)
    assert limiter.hit("k", 1.0)
    assert not limiter.hit("k", 2.0)
    assert limiter.hit("otra", 2.0)
    assert limiter.hit("k", 61.0)
```

Agrega a `backend/tests/conftest.py` (imports arriba, fixtures abajo):
```python
from collections.abc import Callable
from datetime import datetime

from app.auth.service import create_user
from app.core.clock import get_now


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
```

`backend/tests/test_auth_api.py`:
```python
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.auth.service import create_invitation, create_user

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_register_with_invitation_logs_in(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    response = client.post(
        "/api/auth/register",
        json={"token": token, "password": "clave-segura-123", "display_name": "Nueva"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] == "nueva@example.com"
    assert "session" in response.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Nueva"


def test_register_rejects_reused_invitation(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    body = {"token": token, "password": "clave-segura-123", "display_name": "Nueva"}
    assert client.post("/api/auth/register", json=body).status_code == 201
    second = TestClient(client.app, headers={"Origin": "http://localhost:3000"})
    response = second.post("/api/auth/register", json=body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_INVITATION"


def test_register_rejects_expired_invitation(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC) - timedelta(days=8))
    response = client.post(
        "/api/auth/register",
        json={"token": token, "password": "clave-segura-123", "display_name": "Nueva"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_INVITATION"


def test_register_rejects_short_password(client, db):
    token = create_invitation(db, "nueva@example.com", datetime.now(UTC))
    response = client.post(
        "/api/auth/register", json={"token": token, "password": "corta", "display_name": "N"}
    )
    assert response.status_code == 422


def test_login_wrong_password_and_unknown_email(client, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    for email, password in [("ana@example.com", "incorrecta-123"), ("nadie@example.com", "x")]:
        response = client.post("/api/auth/login", json={"email": email, "password": password})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_rate_limit(client, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "ana@example.com", "password": "mala-123"})
    response = client.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "clave-segura-123"}
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "LOGIN_RATE_LIMITED"


def test_me_requires_session(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


def test_logout_revokes_session(client_a):
    assert client_a.post("/api/auth/logout").status_code == 204
    assert client_a.get("/api/auth/me").status_code == 401


def test_session_expires_without_activity(make_client, set_now):
    set_now(NOW)
    c = make_client("ana@example.com")
    set_now(NOW + timedelta(days=31))
    assert c.get("/api/auth/me").status_code == 401


def test_session_slides_with_activity(make_client, set_now):
    set_now(NOW)
    c = make_client("ana@example.com")
    set_now(NOW + timedelta(days=20))
    assert c.get("/api/auth/me").status_code == 200
    set_now(NOW + timedelta(days=45))
    assert c.get("/api/auth/me").status_code == 200


def test_mutation_with_foreign_origin_is_rejected(client_a):
    response = client_a.post("/api/auth/logout", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_mutation_without_origin_header_is_allowed(app, db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    no_origin = TestClient(app)
    response = no_origin.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "clave-segura-123"}
    )
    assert response.status_code == 200
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_ratelimit.py tests/test_auth_api.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.core.ratelimit'`.

- [ ] **Step 3: Rate limiter**

`backend/app/core/ratelimit.py`:
```python
from collections import defaultdict, deque
from threading import Lock


class RateLimiter:
    """Ventana deslizante en memoria (una sola instancia del backend)."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, now: float) -> bool:
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True
```

- [ ] **Step 4: Servicio de sesiones**

Agrega a `backend/app/auth/service.py` (imports `from app.core.config import get_settings` y `from app.core.security import DUMMY_HASH, verify_password`):
```python
def register_with_invitation(
    db: Session, token: str, password: str, display_name: str, now: datetime
) -> User:
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    if invitation is None or invitation.used_at is not None or invitation.expires_at <= now:
        raise AppError(400, "INVALID_INVITATION", "La invitación no es válida o expiró")
    invitation.used_at = now
    return create_user(db, invitation.email, password, display_name)


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        verify_password(DUMMY_HASH, password)
        return None
    if not user.is_active or not verify_password(user.password_hash, password):
        return None
    return user


def create_session(db: Session, user: User, now: datetime, user_agent: str | None) -> str:
    token = new_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=get_settings().session_days),
            user_agent=(user_agent or "")[:300] or None,
        )
    )
    db.commit()
    return token


def resolve_session(db: Session, token: str, now: datetime) -> User | None:
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        return None
    renewed = now + timedelta(days=get_settings().session_days)
    if renewed - session.expires_at > timedelta(days=1):
        session.expires_at = renewed
        db.commit()
    return user


def revoke_session(db: Session, token: str, now: datetime) -> None:
    db.execute(
        update(UserSession)
        .where(UserSession.token_hash == hash_token(token), UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
```

- [ ] **Step 5: Schemas, dependencia y router**

`backend/app/auth/schemas.py`:
```python
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class RegisterIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=10, max_length=200)
    display_name: DisplayName


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    timezone: str
```

`backend/app/auth/deps.py`:
```python
from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.service import resolve_session
from app.core.clock import get_now
from app.core.db import get_db
from app.core.errors import AppError

SESSION_COOKIE = "session"


def get_current_user(
    request: Request, db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = resolve_session(db, token, now) if token else None
    if user is None:
        raise AppError(401, "NOT_AUTHENTICATED", "Inicia sesión")
    return user
```

`backend/app/auth/router.py`:
```python
import time
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth.deps import SESSION_COOKIE, get_current_user
from app.auth.models import User
from app.auth.schemas import LoginIn, RegisterIn, UserOut
from app.auth.service import (
    authenticate,
    create_session,
    normalize_email,
    register_with_invitation,
    revoke_session,
)
from app.core.clock import get_now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@router.post("/register", status_code=201, response_model=UserOut)
def register(
    body: RegisterIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> User:
    user = register_with_invitation(db, body.token, body.password, body.display_name, now)
    token = create_session(db, user, now, request.headers.get("user-agent"))
    _set_session_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> User:
    host = request.client.host if request.client else "unknown"
    key = f"{host}|{normalize_email(body.email)}"
    if not request.app.state.login_limiter.hit(key, time.monotonic()):
        raise AppError(429, "LOGIN_RATE_LIMITED", "Demasiados intentos, espera un minuto")
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos")
    token = create_session(db, user, now, request.headers.get("user-agent"))
    _set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(db, token, now)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
```

`backend/app/main.py` completo:
```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import error_body, register_error_handlers
from app.core.ratelimit import RateLimiter

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Finanzas API")
    app.state.login_limiter = RateLimiter(settings.login_rate_limit_per_minute, 60)
    app.state.ai_limiter = RateLimiter(settings.ai_rate_limit_per_hour, 3600)
    register_error_handlers(app)

    @app.middleware("http")
    async def check_origin(request: Request, call_next: RequestResponseEndpoint) -> Response:
        origin = request.headers.get("origin")
        if (
            request.method in MUTATING_METHODS
            and origin is not None
            and origin != settings.allowed_origin
        ):
            return JSONResponse(
                status_code=403, content=error_body("ORIGIN_NOT_ALLOWED", "Origen no permitido")
            )
        return await call_next(request)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    return app


app = create_app()
```

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(auth): add register/login/logout/me with cookie sessions, origin check and login rate limit"
```

---

### Task 5: Categorías (con siembra de predefinidas)

**Files:**
- Create: `backend/app/categories/__init__.py`, `models.py`, `schemas.py`, `service.py`, `router.py`
- Modify: `backend/app/models.py`, `backend/app/auth/service.py` (sembrar al crear usuario), `backend/app/main.py`
- Create: migración autogenerada `categories`
- Test: `backend/tests/test_categories.py`

**Interfaces:**
- Consumes: `get_current_user`, `get_owned`, `AppError`, `Name`, `get_now`.
- Produces:
  - Modelo `Category` (`user_id`, `name`, `kind: "income" | "expense"`, `archived_at`, propiedad `archived`); constraint `uq_categories_user_name_kind`.
  - `CategoryKind = Literal["income", "expense"]`; `CategoryOut {id, name, kind, archived}`.
  - `DEFAULT_CATEGORIES`; `seed_default_categories(db, user_id) -> None` (sin commit).
  - Endpoints: `GET /api/categories?include_archived=false`, `POST /api/categories` (201; 409 `CATEGORY_NAME_TAKEN`), `PATCH /api/categories/{id}` (`name`, `archived`), `DELETE /api/categories/{id}` (204; 409 `CATEGORY_IN_USE`; 404 `CATEGORY_NOT_FOUND`).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_categories.py`:
```python
def _names(client, **params):
    return {(c["name"], c["kind"]) for c in client.get("/api/categories", params=params).json()}


def test_new_user_gets_default_categories(client_a):
    names = _names(client_a)
    assert ("Salario", "income") in names
    assert ("Comida", "expense") in names
    assert len(names) == 10


def test_create_category(client_a):
    response = client_a.post("/api/categories", json={"name": "  Mascotas ", "kind": "expense"})
    assert response.status_code == 201
    assert response.json()["name"] == "Mascotas"
    assert response.json()["archived"] is False


def test_duplicate_name_same_kind_is_conflict_case_insensitive(client_a):
    response = client_a.post("/api/categories", json={"name": "comida", "kind": "expense"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"


def test_same_name_other_kind_is_allowed(client_a):
    response = client_a.post("/api/categories", json={"name": "Otros", "kind": "income"})
    assert response.status_code == 201


def test_rename_and_archive(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    renamed = client_a.patch(f"/api/categories/{cat['id']}", json={"name": "Vacaciones"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Vacaciones"
    archived = client_a.patch(f"/api/categories/{cat['id']}", json={"archived": True})
    assert archived.json()["archived"] is True
    assert ("Vacaciones", "expense") not in _names(client_a)
    assert ("Vacaciones", "expense") in _names(client_a, include_archived="true")
    restored = client_a.patch(f"/api/categories/{cat['id']}", json={"archived": False})
    assert restored.json()["archived"] is False


def test_rename_to_existing_name_conflicts(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    response = client_a.patch(f"/api/categories/{cat['id']}", json={"name": "Comida"})
    assert response.status_code == 409


def test_delete_unused_category(client_a):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    assert client_a.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert ("Viajes", "expense") not in _names(client_a, include_archived="true")


def test_other_user_cannot_touch_category(client_a, client_b):
    cat = client_a.post("/api/categories", json={"name": "Viajes", "kind": "expense"}).json()
    assert client_b.patch(f"/api/categories/{cat['id']}", json={"name": "X"}).status_code == 404
    response = client_b.delete(f"/api/categories/{cat['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "CATEGORY_NOT_FOUND"
    assert ("Viajes", "expense") not in _names(client_b)


def test_categories_require_auth(client):
    assert client.get("/api/categories").status_code == 401
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_categories.py -v`
Expected: FAIL (404 en `/api/categories` porque el router no existe).

- [ ] **Step 3: Modelo**

`backend/app/categories/__init__.py`: vacío.

`backend/app/categories/models.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class Category(IdTimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", "kind", name="uq_categories_user_name_kind"),
        CheckConstraint("kind IN ('income', 'expense')", name="kind_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def archived(self) -> bool:
        return self.archived_at is not None
```

Agrega a `backend/app/models.py`: `from app.categories.models import Category` y `"Category"` en `__all__`.

- [ ] **Step 4: Schemas, servicio, router**

`backend/app/categories/schemas.py`:
```python
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.types import Name

CategoryKind = Literal["income", "expense"]


class CategoryCreate(BaseModel):
    name: Name
    kind: CategoryKind


class CategoryUpdate(BaseModel):
    name: Name | None = None
    archived: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    kind: CategoryKind
    archived: bool
```

`backend/app/categories/service.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.categories.schemas import CategoryCreate, CategoryUpdate
from app.core.db import get_owned
from app.core.errors import AppError

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Salario", "income"),
    ("Ingreso extra", "income"),
    ("Comida", "expense"),
    ("Transporte", "expense"),
    ("Vivienda", "expense"),
    ("Servicios", "expense"),
    ("Suscripciones", "expense"),
    ("Salud", "expense"),
    ("Ocio", "expense"),
    ("Otros", "expense"),
]

NAME_TAKEN = AppError(409, "CATEGORY_NAME_TAKEN", "Ya tienes una categoría con ese nombre")


def seed_default_categories(db: Session, user_id: uuid.UUID) -> None:
    for name, kind in DEFAULT_CATEGORIES:
        db.add(Category(user_id=user_id, name=name, kind=kind))
    db.flush()


def list_categories(db: Session, user_id: uuid.UUID, include_archived: bool) -> list[Category]:
    stmt = select(Category).where(Category.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list(db.scalars(stmt.order_by(Category.kind, Category.name)))


def _ensure_name_free(
    db: Session, user_id: uuid.UUID, name: str, kind: str, exclude_id: uuid.UUID | None = None
) -> None:
    stmt = select(Category.id).where(
        Category.user_id == user_id,
        Category.kind == kind,
        func.lower(Category.name) == name.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise NAME_TAKEN


def create_category(db: Session, user_id: uuid.UUID, data: CategoryCreate) -> Category:
    _ensure_name_free(db, user_id, data.name, data.kind)
    category = Category(user_id=user_id, name=data.name, kind=data.kind)
    db.add(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise NAME_TAKEN from exc
    return category


def update_category(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID, data: CategoryUpdate, now: datetime
) -> Category:
    category = get_owned(db, Category, category_id, user_id, "CATEGORY_NOT_FOUND")
    if data.name is not None:
        _ensure_name_free(db, user_id, data.name, category.kind, exclude_id=category.id)
        category.name = data.name
    if data.archived is not None:
        category.archived_at = now if data.archived else None
    db.commit()
    return category


def delete_category(db: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
    category = get_owned(db, Category, category_id, user_id, "CATEGORY_NOT_FOUND")
    db.delete(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409, "CATEGORY_IN_USE", "La categoría tiene movimientos; archívala en su lugar"
        ) from exc
```

`backend/app/categories/router.py`:
```python
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.categories.models import Category
from app.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.categories.service import (
    create_category,
    delete_category,
    list_categories,
    update_category,
)
from app.core.clock import get_now
from app.core.db import get_db

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Category]:
    return list_categories(db, user.id, include_archived)


@router.post("", status_code=201, response_model=CategoryOut)
def create(
    body: CategoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Category:
    return create_category(db, user.id, body)


@router.patch("/{category_id}", response_model=CategoryOut)
def update(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> Category:
    return update_category(db, user.id, category_id, body, now)


@router.delete("/{category_id}", status_code=204)
def delete(
    category_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_category(db, user.id, category_id)
```

En `backend/app/main.py`: `from app.categories.router import router as categories_router` y `app.include_router(categories_router)` después de `auth_router`.

En `backend/app/auth/service.py`, dentro de `create_user`, entre `db.flush()` y `db.commit()`:
```python
    seed_default_categories(db, user.id)
```
con `from app.categories.service import seed_default_categories`.

- [ ] **Step 5: Migración**

Run: `uv run alembic revision --autogenerate -m "categories" && uv run alembic upgrade head`
Expected: migración con `create_table("categories", ...)`, `uq_categories_user_name_kind`, `ck_categories_kind_valid`, `ix_categories_user_id`.

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(categories): add per-user categories with defaults, archive and delete"
```

---

### Task 6: Cuentas

**Files:**
- Create: `backend/app/accounts/__init__.py`, `models.py`, `schemas.py`, `service.py`, `balances.py`, `router.py`
- Modify: `backend/app/models.py`, `backend/app/main.py`
- Create: migración autogenerada `accounts`; `backend/tests/factories.py`
- Test: `backend/tests/test_accounts.py`

**Interfaces:**
- Consumes: igual que Task 5.
- Produces:
  - Modelo `Account` (`user_id`, `name`, `type: cash|debit|savings|credit_card`, `initial_balance: int`, `archived_at`, propiedad `archived`); `uq_accounts_user_name`.
  - `AccountType` Literal; `AccountOut {id, name, type, initial_balance, archived, balance}`.
  - `compute_balances(db, user_id) -> dict[UUID, int]` (en esta tarea devuelve el saldo inicial; Task 8 lo reemplaza).
  - Endpoints: `GET /api/accounts?include_archived=false`, `POST /api/accounts` (201; 409 `ACCOUNT_NAME_TAKEN`), `PATCH /api/accounts/{id}` (`name`, `initial_balance`, `archived`), `DELETE /api/accounts/{id}` (204; 409 `ACCOUNT_IN_USE`; 404 `ACCOUNT_NOT_FOUND`).
  - `tests/factories.py`: `create_account(client, name="Bancolombia", type="debit", initial_balance=0) -> dict`, `category_id(client, name, kind="expense") -> str`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/factories.py`:
```python
from fastapi.testclient import TestClient


def create_account(
    client: TestClient, name: str = "Bancolombia", type: str = "debit", initial_balance: int = 0
) -> dict:
    response = client.post(
        "/api/accounts", json={"name": name, "type": type, "initial_balance": initial_balance}
    )
    assert response.status_code == 201, response.text
    return response.json()


def category_id(client: TestClient, name: str, kind: str = "expense") -> str:
    response = client.get("/api/categories", params={"include_archived": "true"})
    assert response.status_code == 200
    return next(c["id"] for c in response.json() if c["name"] == name and c["kind"] == kind)
```

`backend/tests/test_accounts.py`:
```python
from tests.factories import create_account


def test_create_account_and_list_with_balance(client_a):
    acc = create_account(client_a, "Nu", "credit_card", -150_000)
    assert acc["balance"] == -150_000
    assert acc["archived"] is False
    listed = client_a.get("/api/accounts").json()
    assert [a["name"] for a in listed] == ["Nu"]


def test_invalid_type_is_rejected(client_a):
    response = client_a.post("/api/accounts", json={"name": "X", "type": "crypto"})
    assert response.status_code == 422


def test_duplicate_account_name_conflicts(client_a):
    create_account(client_a, "Bancolombia")
    response = client_a.post("/api/accounts", json={"name": "bancolombia", "type": "cash"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ACCOUNT_NAME_TAKEN"


def test_update_and_archive_account(client_a):
    acc = create_account(client_a, "Efectivo", "cash")
    response = client_a.patch(
        f"/api/accounts/{acc['id']}", json={"name": "Billetera", "initial_balance": 20_000}
    )
    assert response.json()["name"] == "Billetera"
    assert response.json()["balance"] == 20_000
    client_a.patch(f"/api/accounts/{acc['id']}", json={"archived": True})
    assert client_a.get("/api/accounts").json() == []
    archived = client_a.get("/api/accounts", params={"include_archived": "true"}).json()
    assert archived[0]["archived"] is True


def test_delete_unused_account(client_a):
    acc = create_account(client_a)
    assert client_a.delete(f"/api/accounts/{acc['id']}").status_code == 204


def test_other_user_cannot_touch_account(client_a, client_b):
    acc = create_account(client_a)
    assert client_b.patch(f"/api/accounts/{acc['id']}", json={"name": "X"}).status_code == 404
    response = client_b.delete(f"/api/accounts/{acc['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ACCOUNT_NOT_FOUND"
    assert client_b.get("/api/accounts").json() == []
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_accounts.py -v`
Expected: FAIL (`/api/accounts` → 404).

- [ ] **Step 3: Modelo**

`backend/app/accounts/__init__.py`: vacío.

`backend/app/accounts/models.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class Account(IdTimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_accounts_user_name"),
        CheckConstraint("type IN ('cash', 'debit', 'savings', 'credit_card')", name="type_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    type: Mapped[str] = mapped_column(String(20))
    initial_balance: Mapped[int] = mapped_column(BigInteger, default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def archived(self) -> bool:
        return self.archived_at is not None
```

Agrega `Account` a `backend/app/models.py`.

- [ ] **Step 4: Schemas, balances provisional, servicio, router**

`backend/app/accounts/schemas.py`:
```python
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.core.types import Name, SignedMoney

AccountType = Literal["cash", "debit", "savings", "credit_card"]


class AccountCreate(BaseModel):
    name: Name
    type: AccountType
    initial_balance: SignedMoney = 0


class AccountUpdate(BaseModel):
    name: Name | None = None
    initial_balance: SignedMoney | None = None
    archived: bool | None = None


class AccountOut(BaseModel):
    id: UUID
    name: str
    type: AccountType
    initial_balance: int
    archived: bool
    balance: int
```

`backend/app/accounts/balances.py`:
```python
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account


def compute_balances(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(Account.id, Account.initial_balance).where(Account.user_id == user_id)
    )
    return {account_id: int(balance) for account_id, balance in rows}
```

`backend/app/accounts/service.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.accounts.schemas import AccountCreate, AccountUpdate
from app.core.db import get_owned
from app.core.errors import AppError

NAME_TAKEN = AppError(409, "ACCOUNT_NAME_TAKEN", "Ya tienes una cuenta con ese nombre")


def list_accounts(db: Session, user_id: uuid.UUID, include_archived: bool) -> list[Account]:
    stmt = select(Account).where(Account.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Account.archived_at.is_(None))
    return list(db.scalars(stmt.order_by(Account.name)))


def _ensure_name_free(
    db: Session, user_id: uuid.UUID, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    stmt = select(Account.id).where(
        Account.user_id == user_id, func.lower(Account.name) == name.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Account.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise NAME_TAKEN


def create_account(db: Session, user_id: uuid.UUID, data: AccountCreate) -> Account:
    _ensure_name_free(db, user_id, data.name)
    account = Account(
        user_id=user_id, name=data.name, type=data.type, initial_balance=data.initial_balance
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise NAME_TAKEN from exc
    return account


def update_account(
    db: Session, user_id: uuid.UUID, account_id: uuid.UUID, data: AccountUpdate, now: datetime
) -> Account:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    if data.name is not None:
        _ensure_name_free(db, user_id, data.name, exclude_id=account.id)
        account.name = data.name
    if data.initial_balance is not None:
        account.initial_balance = data.initial_balance
    if data.archived is not None:
        account.archived_at = now if data.archived else None
    db.commit()
    return account


def delete_account(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> None:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    db.delete(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409, "ACCOUNT_IN_USE", "La cuenta tiene movimientos; archívala en su lugar"
        ) from exc
```

`backend/app/accounts/router.py`:
```python
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.accounts.balances import compute_balances
from app.accounts.models import Account
from app.accounts.schemas import AccountCreate, AccountOut, AccountUpdate
from app.accounts.service import create_account, delete_account, list_accounts, update_account
from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.db import get_db

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _out(account: Account, balances: dict[uuid.UUID, int]) -> AccountOut:
    return AccountOut(
        id=account.id,
        name=account.name,
        type=account.type,  # type: ignore[arg-type]
        initial_balance=account.initial_balance,
        archived=account.archived,
        balance=balances.get(account.id, account.initial_balance),
    )


@router.get("", response_model=list[AccountOut])
def list_(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AccountOut]:
    balances = compute_balances(db, user.id)
    return [_out(a, balances) for a in list_accounts(db, user.id, include_archived)]


@router.post("", status_code=201, response_model=AccountOut)
def create(
    body: AccountCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AccountOut:
    account = create_account(db, user.id, body)
    return _out(account, compute_balances(db, user.id))


@router.patch("/{account_id}", response_model=AccountOut)
def update(
    account_id: uuid.UUID,
    body: AccountUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> AccountOut:
    account = update_account(db, user.id, account_id, body, now)
    return _out(account, compute_balances(db, user.id))


@router.delete("/{account_id}", status_code=204)
def delete(
    account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_account(db, user.id, account_id)
```

En `backend/app/main.py`: importar `accounts_router` e `app.include_router(accounts_router)`.

- [ ] **Step 5: Migración**

Run: `uv run alembic revision --autogenerate -m "accounts" && uv run alembic upgrade head`
Expected: `create_table("accounts", ...)` con `uq_accounts_user_name` y `ck_accounts_type_valid`.

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(accounts): add accounts with archive/delete and balance field"
```

---

### Task 7: Transacciones (crear, ver, editar, borrar) con validación de forma

**Files:**
- Create: `backend/app/transactions/__init__.py`, `models.py`, `schemas.py`, `validation.py`, `service.py`, `router.py`
- Modify: `backend/app/models.py`, `backend/app/main.py`, `backend/tests/factories.py`
- Create: migración autogenerada `transactions`
- Test: `backend/tests/test_transactions.py`

**Interfaces:**
- Consumes: `Account`, `Category`, `get_owned`, `Money`, `Description`, `get_current_user`.
- Produces:
  - Modelo `Transaction` (`user_id`, `type`, `amount`, `date`, `account_id`, `to_account_id`, `category_id`, `description`, `status` default `"confirmed"`, `source` default `"manual"`), con los `CHECK` `amount_positive`, `type_valid`, `status_valid`, `source_valid`, `shape_valid` e índices `ix_transactions_user_date`, `ix_transactions_user_category_date`. FKs a cuentas y categorías con `ondelete="RESTRICT"`.
  - `TransactionType`, `TransactionStatus`, `ClientSource` Literals; `TransactionCreate`, `TransactionUpdate`, `TransactionOut`, `TransactionSaved {transaction}`.
  - `Shape(type, account_id, to_account_id, category_id)`; `validate_shape(db, user_id, shape, allow_archived=frozenset()) -> None`.
  - `create_transaction(db, user_id, data) -> Transaction`; `get_transaction(db, user_id, id) -> Transaction` (404 `TRANSACTION_NOT_FOUND`); `apply_changes(db, user_id, txn, data) -> None` (sin commit); `update_transaction(db, user_id, id, data) -> Transaction`; `delete_transaction(db, user_id, id) -> None`.
  - Endpoints: `POST /api/transactions` (201, `TransactionSaved`), `GET /api/transactions/{id}`, `PATCH /api/transactions/{id}`, `DELETE /api/transactions/{id}` (204).
  - Factory `create_txn(client, **fields) -> dict` (devuelve `transaction`).

- [ ] **Step 1: Escribir los tests que fallan**

Agrega a `backend/tests/factories.py`:
```python
def create_txn(client: TestClient, **fields: object) -> dict:
    response = client.post("/api/transactions", json=fields)
    assert response.status_code == 201, response.text
    return response.json()["transaction"]
```

`backend/tests/test_transactions.py`:
```python
import pytest

from tests.factories import category_id, create_account, create_txn


@pytest.fixture
def setup(client_a):
    debit = create_account(client_a, "Bancolombia", "debit")
    savings = create_account(client_a, "Ahorro", "savings")
    return {
        "debit": debit["id"],
        "savings": savings["id"],
        "comida": category_id(client_a, "Comida"),
        "salario": category_id(client_a, "Salario", "income"),
    }


def _expense(s, **extra):
    return {
        "type": "expense",
        "amount": 35_000,
        "date": "2026-10-03",
        "account_id": s["debit"],
        "category_id": s["comida"],
        "description": "Almuerzo",
        **extra,
    }


def _post(client, payload):
    return client.post("/api/transactions", json=payload)


def test_create_expense(client_a, setup):
    response = _post(client_a, _expense(setup))
    assert response.status_code == 201
    txn = response.json()["transaction"]
    assert txn["amount"] == 35_000
    assert txn["status"] == "confirmed"
    assert txn["source"] == "manual"
    assert txn["date"] == "2026-10-03"


def test_create_transfer(client_a, setup):
    txn = create_txn(
        client_a,
        type="transfer",
        amount=600_000,
        date="2026-10-03",
        account_id=setup["debit"],
        to_account_id=setup["savings"],
    )
    assert txn["category_id"] is None


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"type": "income"}, "CATEGORY_KIND_MISMATCH"),
        ({"category_id": None}, "CATEGORY_REQUIRED"),
        ({"to_account_id": "SAVINGS"}, "TO_ACCOUNT_NOT_ALLOWED"),
        ({"type": "transfer", "category_id": None}, "TO_ACCOUNT_REQUIRED"),
        ({"type": "transfer", "category_id": None, "to_account_id": "DEBIT"}, "SAME_ACCOUNT_TRANSFER"),
        ({"type": "transfer", "to_account_id": "SAVINGS"}, "CATEGORY_NOT_ALLOWED"),
    ],
)
def test_shape_errors(client_a, setup, overrides, code):
    resolved = {
        k: {"SAVINGS": setup["savings"], "DEBIT": setup["debit"]}.get(v, v) if isinstance(v, str) else v
        for k, v in overrides.items()
    }
    response = _post(client_a, _expense(setup, **resolved))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


@pytest.mark.parametrize("amount", [0, -5, 1.5, 1_000_000_000_001])
def test_invalid_amounts(client_a, setup, amount):
    response = _post(client_a, _expense(setup, amount=amount))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_client_cannot_set_recurring_source(client_a, setup):
    assert _post(client_a, _expense(setup, source="recurring")).status_code == 422


def test_voice_source_is_stored(client_a, setup):
    assert create_txn(client_a, **_expense(setup, source="voice"))["source"] == "voice"


def test_other_users_account_is_not_found(client_a, client_b, setup):
    other = create_account(client_b, "Davivienda")
    response = _post(client_a, _expense(setup, account_id=other["id"]))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ACCOUNT_NOT_FOUND"


def test_archived_account_cannot_be_used_for_new_transactions(client_a, setup):
    client_a.patch(f"/api/accounts/{setup['debit']}", json={"archived": True})
    response = _post(client_a, _expense(setup))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ACCOUNT_ARCHIVED"


def test_archived_category_cannot_be_used(client_a, setup):
    client_a.patch(f"/api/categories/{setup['comida']}", json={"archived": True})
    response = _post(client_a, _expense(setup))
    assert response.json()["error"]["code"] == "CATEGORY_ARCHIVED"


def test_patch_amount_and_description(client_a, setup):
    txn = create_txn(client_a, **_expense(setup))
    response = client_a.patch(
        f"/api/transactions/{txn['id']}", json={"amount": 40_000, "description": "Almuerzo+jugo"}
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 40_000


def test_patch_type_to_transfer_with_stale_category_is_rejected(client_a, setup):
    txn = create_txn(client_a, **_expense(setup))
    response = client_a.patch(
        f"/api/transactions/{txn['id']}",
        json={"type": "transfer", "to_account_id": setup["savings"]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CATEGORY_NOT_ALLOWED"
    ok = client_a.patch(
        f"/api/transactions/{txn['id']}",
        json={"type": "transfer", "to_account_id": setup["savings"], "category_id": None},
    )
    assert ok.status_code == 200
    assert ok.json()["type"] == "transfer"


def test_patch_null_required_field_is_rejected(client_a, setup):
    txn = create_txn(client_a, **_expense(setup))
    response = client_a.patch(f"/api/transactions/{txn['id']}", json={"amount": None})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "FIELD_REQUIRED"


def test_patch_keeps_archived_account_when_unchanged(client_a, setup):
    txn = create_txn(client_a, **_expense(setup))
    client_a.patch(f"/api/accounts/{setup['debit']}", json={"archived": True})
    response = client_a.patch(f"/api/transactions/{txn['id']}", json={"amount": 1_000})
    assert response.status_code == 200


def test_get_and_delete(client_a, setup):
    txn = create_txn(client_a, **_expense(setup))
    assert client_a.get(f"/api/transactions/{txn['id']}").status_code == 200
    assert client_a.delete(f"/api/transactions/{txn['id']}").status_code == 204
    response = client_a.get(f"/api/transactions/{txn['id']}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "TRANSACTION_NOT_FOUND"


def test_other_user_cannot_touch_transaction(client_a, client_b, setup):
    txn = create_txn(client_a, **_expense(setup))
    assert client_b.get(f"/api/transactions/{txn['id']}").status_code == 404
    assert client_b.patch(f"/api/transactions/{txn['id']}", json={"amount": 1}).status_code == 404
    assert client_b.delete(f"/api/transactions/{txn['id']}").status_code == 404
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_transactions.py -v`
Expected: FAIL (`/api/transactions` → 404).

- [ ] **Step 3: Modelo**

`backend/app/transactions/__init__.py`: vacío.

`backend/app/transactions/models.py`:
```python
import datetime as dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin

SHAPE_CHECK = (
    "(type = 'transfer' AND to_account_id IS NOT NULL AND category_id IS NULL"
    " AND to_account_id <> account_id)"
    " OR (type <> 'transfer' AND to_account_id IS NULL AND category_id IS NOT NULL)"
)


class Transaction(IdTimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("type IN ('income', 'expense', 'transfer')", name="type_valid"),
        CheckConstraint("status IN ('confirmed', 'pending')", name="status_valid"),
        CheckConstraint(
            "source IN ('manual', 'voice', 'recurring', 'savings_rule')", name="source_valid"
        ),
        CheckConstraint(SHAPE_CHECK, name="shape_valid"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_user_category_date", "user_id", "category_id", "date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(BigInteger)
    date: Mapped[dt.date] = mapped_column(Date)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    description: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="confirmed")
    source: Mapped[str] = mapped_column(String(15), default="manual")
```

Agrega `Transaction` a `backend/app/models.py`.

- [ ] **Step 4: Schemas y validación**

`backend/app/transactions/schemas.py`:
```python
import datetime as dt
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.types import Description, Money

TransactionType = Literal["income", "expense", "transfer"]
TransactionStatus = Literal["confirmed", "pending"]
ClientSource = Literal["manual", "voice", "savings_rule"]


class TransactionCreate(BaseModel):
    type: TransactionType
    amount: Money
    date: dt.date
    account_id: UUID
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    source: ClientSource = "manual"


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Money | None = None
    date: dt.date | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: TransactionType
    amount: int
    date: dt.date
    account_id: UUID
    to_account_id: UUID | None
    category_id: UUID | None
    description: str | None
    status: TransactionStatus
    source: str
    created_at: dt.datetime


class TransactionSaved(BaseModel):
    transaction: TransactionOut
```

`backend/app/transactions/validation.py`:
```python
import uuid
from collections.abc import Set
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError


@dataclass(frozen=True)
class Shape:
    type: str
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None
    category_id: uuid.UUID | None


def _usable_account(
    db: Session, user_id: uuid.UUID, account_id: uuid.UUID, allow_archived: Set[uuid.UUID]
) -> None:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    if account.archived and account.id not in allow_archived:
        raise AppError(422, "ACCOUNT_ARCHIVED", f"La cuenta {account.name} está archivada")


def validate_shape(
    db: Session,
    user_id: uuid.UUID,
    shape: Shape,
    allow_archived: Set[uuid.UUID] = frozenset(),
) -> None:
    _usable_account(db, user_id, shape.account_id, allow_archived)
    if shape.type == "transfer":
        if shape.to_account_id is None:
            raise AppError(422, "TO_ACCOUNT_REQUIRED", "La transferencia necesita cuenta destino")
        if shape.to_account_id == shape.account_id:
            raise AppError(422, "SAME_ACCOUNT_TRANSFER", "Origen y destino deben ser distintos")
        if shape.category_id is not None:
            raise AppError(422, "CATEGORY_NOT_ALLOWED", "Las transferencias no llevan categoría")
        _usable_account(db, user_id, shape.to_account_id, allow_archived)
        return
    if shape.to_account_id is not None:
        raise AppError(422, "TO_ACCOUNT_NOT_ALLOWED", "Solo las transferencias llevan destino")
    if shape.category_id is None:
        raise AppError(422, "CATEGORY_REQUIRED", "Elige una categoría")
    category = get_owned(db, Category, shape.category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.archived and category.id not in allow_archived:
        raise AppError(422, "CATEGORY_ARCHIVED", f"La categoría {category.name} está archivada")
    if category.kind != shape.type:
        raise AppError(
            422, "CATEGORY_KIND_MISMATCH", "La categoría no corresponde al tipo de movimiento"
        )
```

- [ ] **Step 5: Servicio y router**

`backend/app/transactions/service.py`:
```python
import uuid

from sqlalchemy.orm import Session

from app.core.db import get_owned
from app.core.errors import AppError
from app.transactions.models import Transaction
from app.transactions.schemas import TransactionCreate, TransactionUpdate
from app.transactions.validation import Shape, validate_shape

NON_NULLABLE = ("type", "amount", "date", "account_id")


def create_transaction(db: Session, user_id: uuid.UUID, data: TransactionCreate) -> Transaction:
    validate_shape(
        db, user_id, Shape(data.type, data.account_id, data.to_account_id, data.category_id)
    )
    txn = Transaction(user_id=user_id, status="confirmed", **data.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def get_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> Transaction:
    return get_owned(db, Transaction, txn_id, user_id, "TRANSACTION_NOT_FOUND")


def apply_changes(
    db: Session, user_id: uuid.UUID, txn: Transaction, data: TransactionUpdate
) -> None:
    changes = data.model_dump(exclude_unset=True)
    for field in NON_NULLABLE:
        if field in changes and changes[field] is None:
            raise AppError(422, "FIELD_REQUIRED", f"{field} no puede ser nulo", {"field": field})
    shape = Shape(
        type=changes.get("type", txn.type),
        account_id=changes.get("account_id", txn.account_id),
        to_account_id=changes["to_account_id"] if "to_account_id" in changes else txn.to_account_id,
        category_id=changes["category_id"] if "category_id" in changes else txn.category_id,
    )
    unchanged = {i for i in (txn.account_id, txn.to_account_id, txn.category_id) if i is not None}
    validate_shape(db, user_id, shape, allow_archived=unchanged)
    for field, value in changes.items():
        setattr(txn, field, value)


def update_transaction(
    db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate
) -> Transaction:
    txn = get_transaction(db, user_id, txn_id)
    apply_changes(db, user_id, txn, data)
    db.commit()
    db.refresh(txn)
    return txn


def delete_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> None:
    db.delete(get_transaction(db, user_id, txn_id))
    db.commit()
```

`backend/app/transactions/router.py`:
```python
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.db import get_db
from app.transactions.models import Transaction
from app.transactions.schemas import (
    TransactionCreate,
    TransactionOut,
    TransactionSaved,
    TransactionUpdate,
)
from app.transactions.service import (
    create_transaction,
    delete_transaction,
    get_transaction,
    update_transaction,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _saved(db: Session, user_id: uuid.UUID, txn: Transaction) -> TransactionSaved:
    return TransactionSaved(transaction=TransactionOut.model_validate(txn))


@router.post("", status_code=201, response_model=TransactionSaved)
def create(
    body: TransactionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TransactionSaved:
    return _saved(db, user.id, create_transaction(db, user.id, body))


@router.get("/{transaction_id}", response_model=TransactionOut)
def get(
    transaction_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    return get_transaction(db, user.id, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    return update_transaction(db, user.id, transaction_id, body)


@router.delete("/{transaction_id}", status_code=204)
def delete(
    transaction_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_transaction(db, user.id, transaction_id)
```

En `backend/app/main.py`: importar `transactions_router` e incluirlo.

- [ ] **Step 6: Migración**

Run: `uv run alembic revision --autogenerate -m "transactions" && uv run alembic upgrade head`
Expected: `create_table("transactions", ...)` con los 5 `CHECK`, 2 índices y 3 FKs `RESTRICT`.

- [ ] **Step 7: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(transactions): add income/expense/transfer CRUD with shape validation"
```

---

### Task 8: Lista de movimientos con filtros y cursor, saldos reales, borrado de cuentas/categorías en uso

**Files:**
- Modify: `backend/app/accounts/balances.py` (cálculo real)
- Modify: `backend/app/transactions/schemas.py`, `service.py`, `router.py`
- Modify: `backend/tests/factories.py`
- Test: `backend/tests/test_transactions_list.py`, `backend/tests/test_balances.py`

**Interfaces:**
- Consumes: Task 6 y 7.
- Produces:
  - `compute_balances(db, user_id) -> dict[UUID, int]` = saldo inicial + ingresos − egresos − transferencias salientes + transferencias entrantes, solo `confirmed`.
  - `TransactionFilters` (dataclass: `date_from`, `date_to`, `type`, `category_id`, `account_id`, `status`, `q`, `limit`, `cursor`); `list_transactions(db, user_id, filters) -> tuple[list[Transaction], str | None]`; `TransactionPage {items, next_cursor}`.
  - `GET /api/transactions?from=&to=&type=&category_id=&account_id=&status=&q=&limit=50&cursor=` (422 `INVALID_CURSOR`).
  - Factories: `user_id(client) -> str`, `insert_txn(db, client, **fields) -> None` (inserta directo en BD, útil para `pending`).

- [ ] **Step 1: Escribir los tests que fallan**

Agrega a `backend/tests/factories.py`:
```python
import datetime as dt
from uuid import UUID

from sqlalchemy.orm import Session


def user_id(client: TestClient) -> str:
    return client.get("/api/auth/me").json()["id"]


def insert_txn(db: Session, client: TestClient, **fields: object) -> None:
    """Inserta directo en BD (p. ej. pendientes, que la API no permite crear)."""
    from app.transactions.models import Transaction

    values = dict(fields)
    values.setdefault("status", "pending")
    values.setdefault("source", "recurring")
    for key in ("account_id", "to_account_id", "category_id"):
        if isinstance(values.get(key), str):
            values[key] = UUID(str(values[key]))
    if isinstance(values.get("date"), str):
        values["date"] = dt.date.fromisoformat(str(values["date"]))
    db.add(Transaction(user_id=UUID(user_id(client)), **values))
    db.commit()
```
(Mueve los imports nuevos al inicio del archivo.)

`backend/tests/test_balances.py`:
```python
from tests.factories import category_id, create_account, create_txn, insert_txn


def test_balances_follow_confirmed_transactions(client_a, db):
    debit = create_account(client_a, "Bancolombia", "debit", 100_000)["id"]
    savings = create_account(client_a, "Ahorro", "savings")["id"]
    card = create_account(client_a, "Nu", "credit_card")["id"]
    salario = category_id(client_a, "Salario", "income")
    comida = category_id(client_a, "Comida")
    base = {"date": "2026-10-03"}
    create_txn(client_a, type="income", amount=1_000_000, account_id=debit, category_id=salario, **base)
    create_txn(client_a, type="expense", amount=200_000, account_id=debit, category_id=comida, **base)
    create_txn(client_a, type="transfer", amount=300_000, account_id=debit, to_account_id=savings, **base)
    create_txn(client_a, type="expense", amount=50_000, account_id=card, category_id=comida, **base)
    insert_txn(db, client_a, type="expense", amount=999_999, account_id=debit, category_id=comida, **base)

    balances = {a["name"]: a["balance"] for a in client_a.get("/api/accounts").json()}
    assert balances == {"Bancolombia": 600_000, "Ahorro": 300_000, "Nu": -50_000}


def test_paying_the_card_reduces_debt(client_a):
    debit = create_account(client_a, "Bancolombia", "debit", 500_000)["id"]
    card = create_account(client_a, "Nu", "credit_card", -200_000)["id"]
    create_txn(
        client_a, type="transfer", amount=200_000, date="2026-10-03",
        account_id=debit, to_account_id=card,
    )
    balances = {a["name"]: a["balance"] for a in client_a.get("/api/accounts").json()}
    assert balances == {"Bancolombia": 300_000, "Nu": 0}
```

`backend/tests/test_transactions_list.py`:
```python
import pytest

from tests.factories import category_id, create_account, create_txn, insert_txn


@pytest.fixture
def data(client_a, db):
    debit = create_account(client_a, "Bancolombia", "debit")["id"]
    savings = create_account(client_a, "Ahorro", "savings")["id"]
    comida = category_id(client_a, "Comida")
    transporte = category_id(client_a, "Transporte")
    salario = category_id(client_a, "Salario", "income")
    create_txn(client_a, type="income", amount=3_000_000, date="2026-10-01",
               account_id=debit, category_id=salario, description="Sueldo octubre")
    create_txn(client_a, type="expense", amount=35_000, date="2026-10-03",
               account_id=debit, category_id=comida, description="Almuerzo corrientazo")
    create_txn(client_a, type="expense", amount=12_000, date="2026-10-04",
               account_id=debit, category_id=transporte, description="Taxi")
    create_txn(client_a, type="transfer", amount=600_000, date="2026-10-02",
               account_id=debit, to_account_id=savings)
    create_txn(client_a, type="expense", amount=20_000, date="2026-09-28",
               account_id=debit, category_id=comida, description="Mercado")
    insert_txn(db, client_a, type="expense", amount=95_000, date="2026-10-15",
               account_id=debit, category_id=comida)
    return {"debit": debit, "savings": savings, "comida": comida}


def _items(client, **params):
    response = client.get("/api/transactions", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_list_orders_by_date_desc(client_a, data):
    dates = [t["date"] for t in _items(client_a)]
    assert dates == sorted(dates, reverse=True)
    assert len(dates) == 6


def test_filters(client_a, data):
    assert len(_items(client_a, type="expense")) == 4
    assert len(_items(client_a, category_id=data["comida"])) == 3
    assert len(_items(client_a, account_id=data["savings"])) == 1
    assert len(_items(client_a, status="pending")) == 1
    october = _items(client_a, **{"from": "2026-10-01", "to": "2026-10-31"})
    assert len(october) == 5
    assert [t["description"] for t in _items(client_a, q="ALMUERZO")] == ["Almuerzo corrientazo"]


def test_like_wildcards_are_escaped(client_a, data):
    assert _items(client_a, q="%") == []


def test_cursor_pagination_covers_everything_once(client_a, data):
    seen, cursor, pages = [], None, 0
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = client_a.get("/api/transactions", params=params).json()
        seen.extend(t["id"] for t in body["items"])
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert len(seen) == len(set(seen)) == 6


def test_invalid_cursor(client_a, data):
    response = client_a.get("/api/transactions", params={"cursor": "basura"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_CURSOR"


def test_list_is_scoped_to_user(client_b, data):
    assert _items(client_b) == []


def test_delete_category_in_use_conflicts(client_a, data):
    response = client_a.delete(f"/api/categories/{data['comida']}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CATEGORY_IN_USE"


def test_delete_account_in_use_as_destination_conflicts(client_a, data):
    response = client_a.delete(f"/api/accounts/{data['savings']}")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ACCOUNT_IN_USE"
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_balances.py tests/test_transactions_list.py -v`
Expected: FAIL — saldos iguales al inicial y `GET /api/transactions` responde 405.

- [ ] **Step 3: Saldos reales**

Reemplaza `backend/app/accounts/balances.py`:
```python
import uuid

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.transactions.models import Transaction


def compute_balances(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    t, a = Transaction, Account
    signed = case(
        ((t.type == "income") & (t.account_id == a.id), t.amount),
        ((t.type == "expense") & (t.account_id == a.id), -t.amount),
        ((t.type == "transfer") & (t.account_id == a.id), -t.amount),
        ((t.type == "transfer") & (t.to_account_id == a.id), t.amount),
        else_=0,
    )
    stmt = (
        select(a.id, a.initial_balance + func.coalesce(func.sum(signed), 0))
        .select_from(a)
        .outerjoin(
            t,
            (t.status == "confirmed") & or_(t.account_id == a.id, t.to_account_id == a.id),
        )
        .where(a.user_id == user_id)
        .group_by(a.id, a.initial_balance)
    )
    return {account_id: int(balance) for account_id, balance in db.execute(stmt)}
```

- [ ] **Step 4: Lista con filtros y cursor**

Agrega a `backend/app/transactions/schemas.py`:
```python
class TransactionPage(BaseModel):
    items: list[TransactionOut]
    next_cursor: str | None
```

Agrega a `backend/app/transactions/service.py`:
```python
import base64
import datetime as dt
import json
from dataclasses import dataclass

from sqlalchemy import or_, select, tuple_


@dataclass(frozen=True)
class TransactionFilters:
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    type: str | None = None
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    status: str | None = None
    q: str | None = None
    limit: int = 50
    cursor: str | None = None


def _encode_cursor(txn: Transaction) -> str:
    raw = json.dumps([txn.date.isoformat(), txn.created_at.isoformat(), str(txn.id)])
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[dt.date, dt.datetime, uuid.UUID]:
    try:
        d, c, i = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return dt.date.fromisoformat(d), dt.datetime.fromisoformat(c), uuid.UUID(i)
    except (ValueError, TypeError) as exc:
        raise AppError(422, "INVALID_CURSOR", "Cursor inválido") from exc


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_transactions(
    db: Session, user_id: uuid.UUID, f: TransactionFilters
) -> tuple[list[Transaction], str | None]:
    t = Transaction
    stmt = select(t).where(t.user_id == user_id)
    if f.date_from:
        stmt = stmt.where(t.date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(t.date <= f.date_to)
    if f.type:
        stmt = stmt.where(t.type == f.type)
    if f.category_id:
        stmt = stmt.where(t.category_id == f.category_id)
    if f.account_id:
        stmt = stmt.where(or_(t.account_id == f.account_id, t.to_account_id == f.account_id))
    if f.status:
        stmt = stmt.where(t.status == f.status)
    if f.q:
        stmt = stmt.where(t.description.ilike(f"%{_escape_like(f.q)}%", escape="\\"))
    if f.cursor:
        d, c, i = _decode_cursor(f.cursor)
        stmt = stmt.where(tuple_(t.date, t.created_at, t.id) < tuple_(d, c, i))
    stmt = stmt.order_by(t.date.desc(), t.created_at.desc(), t.id.desc()).limit(f.limit + 1)
    rows = list(db.scalars(stmt))
    next_cursor = _encode_cursor(rows[f.limit - 1]) if len(rows) > f.limit else None
    return rows[: f.limit], next_cursor
```
(Junta los imports con los existentes al inicio.)

Agrega a `backend/app/transactions/router.py` **antes** de `@router.get("/{transaction_id}")`:
```python
import datetime as dt

from fastapi import Query

from app.transactions.schemas import TransactionPage, TransactionStatus, TransactionType
from app.transactions.service import TransactionFilters, list_transactions


@router.get("", response_model=TransactionPage)
def list_(
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
    type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    status: TransactionStatus | None = None,
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionPage:
    filters = TransactionFilters(
        date_from, date_to, type, category_id, account_id, status, q, limit, cursor
    )
    items, next_cursor = list_transactions(db, user.id, filters)
    return TransactionPage(
        items=[TransactionOut.model_validate(t) for t in items], next_cursor=next_cursor
    )
```

- [ ] **Step 5: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan (los de borrado en uso pasan por el `IntegrityError` ya manejado en Task 5/6 gracias a las FKs `RESTRICT`).

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(transactions): add filtered cursor-paginated list and real account balances"
```

---

### Task 9: Presupuestos por categoría y estado con alertas

**Files:**
- Create: `backend/app/budgets/__init__.py`, `models.py`, `schemas.py`, `service.py`, `router.py`
- Modify: `backend/app/models.py`, `backend/app/main.py`, `backend/app/transactions/schemas.py`, `backend/app/transactions/router.py`
- Create: migración autogenerada `budgets`
- Test: `backend/tests/test_budgets.py`

**Interfaces:**
- Consumes: `Category`, `Transaction`, `parse_month`, `format_month`, `month_start`, `month_bounds`, `get_owned`, `MonthStr`, `MAX_AMOUNT`.
- Produces:
  - Modelo `Budget` (`user_id`, `category_id` FK cascade, `amount >= 0`, `valid_from` primer día de mes), `uq_budgets_user_category_month`.
  - `BudgetLevel = Literal["none","ok","warning","exceeded"]`; `budget_level(budget: int, spent: int) -> BudgetLevel`.
  - `BudgetSet {category_id, month, amount}`; `BudgetOut {category_id, month, amount}`; `BudgetStatusItem {category_id, category_name, budget, spent, remaining, percent, level, committed}`; `BudgetStatusOut {month, items}`.
  - `set_budget(db, user_id, data) -> Budget`; `compute_budget_status(db, user_id, month, category_ids=None) -> list[BudgetStatusItem]`; `budget_effect(db, user_id, txn) -> BudgetStatusItem | None`.
  - Endpoints: `PUT /api/budgets` (422 `BUDGET_CATEGORY_NOT_EXPENSE`; 404 `CATEGORY_NOT_FOUND`), `GET /api/budgets/status?month=YYYY-MM`.
  - `TransactionSaved.budget_status: BudgetStatusItem | None`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_budgets.py`:
```python
import pytest

from app.budgets.service import budget_level
from tests.factories import category_id, create_account, create_txn, insert_txn


@pytest.mark.parametrize(
    ("budget", "spent", "level"),
    [
        (0, 50_000, "none"),
        (100_000, 0, "ok"),
        (100_000, 79_999, "ok"),
        (100_000, 80_000, "warning"),
        (100_000, 99_999, "warning"),
        (100_000, 100_000, "exceeded"),
        (100_000, 150_000, "exceeded"),
    ],
)
def test_budget_level(budget, spent, level):
    assert budget_level(budget, spent) == level


@pytest.fixture
def s(client_a):
    return {
        "debit": create_account(client_a)["id"],
        "comida": category_id(client_a, "Comida"),
        "salario": category_id(client_a, "Salario", "income"),
    }


def _status(client, month):
    response = client.get("/api/budgets/status", params={"month": month})
    assert response.status_code == 200, response.text
    return {i["category_name"]: i for i in response.json()["items"]}


def _set(client, cat, month, amount):
    return client.put("/api/budgets", json={"category_id": cat, "month": month, "amount": amount})


def test_budget_applies_from_month_onwards(client_a, s):
    assert _set(client_a, s["comida"], "2026-10", 800_000).status_code == 200
    assert _status(client_a, "2026-09")["Comida"]["level"] == "none"
    assert _status(client_a, "2026-10")["Comida"]["budget"] == 800_000
    assert _status(client_a, "2026-12")["Comida"]["budget"] == 800_000


def test_newer_budget_overrides_and_zero_removes(client_a, s):
    _set(client_a, s["comida"], "2026-10", 800_000)
    _set(client_a, s["comida"], "2026-11", 900_000)
    _set(client_a, s["comida"], "2027-01", 0)
    assert _status(client_a, "2026-10")["Comida"]["budget"] == 800_000
    assert _status(client_a, "2026-12")["Comida"]["budget"] == 900_000
    assert _status(client_a, "2027-01")["Comida"]["level"] == "none"


def test_setting_same_month_twice_updates(client_a, s):
    _set(client_a, s["comida"], "2026-10", 800_000)
    _set(client_a, s["comida"], "2026-10", 700_000)
    assert _status(client_a, "2026-10")["Comida"]["budget"] == 700_000


def test_status_counts_confirmed_and_reports_pending_as_committed(client_a, db, s):
    _set(client_a, s["comida"], "2026-10", 100_000)
    base = {"type": "expense", "account_id": s["debit"], "category_id": s["comida"]}
    create_txn(client_a, amount=60_000, date="2026-10-03", **base)
    create_txn(client_a, amount=25_000, date="2026-10-10", **base)
    create_txn(client_a, amount=99_000, date="2026-09-30", **base)
    insert_txn(db, client_a, amount=40_000, date="2026-10-20", **base)
    item = _status(client_a, "2026-10")["Comida"]
    assert item["spent"] == 85_000
    assert item["remaining"] == 15_000
    assert item["percent"] == 85
    assert item["level"] == "warning"
    assert item["committed"] == 40_000


def test_income_category_cannot_have_budget(client_a, s):
    response = _set(client_a, s["salario"], "2026-10", 1)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "BUDGET_CATEGORY_NOT_EXPENSE"


def test_invalid_month(client_a, s):
    assert _set(client_a, s["comida"], "2026-13", 1).json()["error"]["code"] == "INVALID_MONTH"
    response = client_a.get("/api/budgets/status", params={"month": "octubre"})
    assert response.status_code == 422


def test_other_user_cannot_budget_my_category(client_a, client_b, s):
    response = _set(client_b, s["comida"], "2026-10", 1)
    assert response.status_code == 404


def test_saving_expense_returns_budget_status(client_a, s):
    _set(client_a, s["comida"], "2026-10", 100_000)
    response = client_a.post(
        "/api/transactions",
        json={"type": "expense", "amount": 80_000, "date": "2026-10-03",
              "account_id": s["debit"], "category_id": s["comida"]},
    )
    status = response.json()["budget_status"]
    assert status["level"] == "warning"
    assert status["remaining"] == 20_000


def test_saving_income_has_no_budget_status(client_a, s):
    response = client_a.post(
        "/api/transactions",
        json={"type": "income", "amount": 1, "date": "2026-10-03",
              "account_id": s["debit"], "category_id": s["salario"]},
    )
    assert response.json()["budget_status"] is None
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_budgets.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.budgets'`.

- [ ] **Step 3: Modelo**

`backend/app/budgets/__init__.py`: vacío.

`backend/app/budgets/models.py`:
```python
import datetime as dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class Budget(IdTimestampMixin, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "category_id", "valid_from", name="uq_budgets_user_category_month"
        ),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        CheckConstraint("EXTRACT(DAY FROM valid_from) = 1", name="valid_from_first_day"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE")
    )
    amount: Mapped[int] = mapped_column(BigInteger)
    valid_from: Mapped[dt.date] = mapped_column(Date)
```

Agrega `Budget` a `backend/app/models.py`.

- [ ] **Step 4: Schemas y servicio**

`backend/app/budgets/schemas.py`:
```python
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.types import MAX_AMOUNT, MonthStr

BudgetLevel = Literal["none", "ok", "warning", "exceeded"]


class BudgetSet(BaseModel):
    category_id: UUID
    month: MonthStr
    amount: int = Field(ge=0, le=MAX_AMOUNT)


class BudgetOut(BaseModel):
    category_id: UUID
    month: str
    amount: int


class BudgetStatusItem(BaseModel):
    category_id: UUID
    category_name: str
    budget: int
    spent: int
    remaining: int | None
    percent: int | None
    level: BudgetLevel
    committed: int


class BudgetStatusOut(BaseModel):
    month: str
    items: list[BudgetStatusItem]
```

`backend/app/budgets/service.py`:
```python
import datetime as dt
import uuid
from collections.abc import Set

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.budgets.models import Budget
from app.budgets.schemas import BudgetLevel, BudgetSet, BudgetStatusItem
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError
from app.core.months import month_bounds, month_start, parse_month
from app.transactions.models import Transaction


def budget_level(budget: int, spent: int) -> BudgetLevel:
    if budget <= 0:
        return "none"
    if spent >= budget:
        return "exceeded"
    if spent * 100 >= budget * 80:
        return "warning"
    return "ok"


def set_budget(db: Session, user_id: uuid.UUID, data: BudgetSet) -> Budget:
    month = parse_month(data.month)
    category = get_owned(db, Category, data.category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.kind != "expense":
        raise AppError(
            422, "BUDGET_CATEGORY_NOT_EXPENSE", "Solo las categorías de gasto tienen presupuesto"
        )
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category_id == category.id,
            Budget.valid_from == month,
        )
    )
    if budget is None:
        budget = Budget(
            user_id=user_id, category_id=category.id, valid_from=month, amount=data.amount
        )
        db.add(budget)
    else:
        budget.amount = data.amount
    db.commit()
    return budget


def _effective_budgets(db: Session, user_id: uuid.UUID, month: dt.date) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(Budget.category_id, Budget.amount)
        .where(Budget.user_id == user_id, Budget.valid_from <= month)
        .order_by(Budget.valid_from)
    )
    effective: dict[uuid.UUID, int] = {}
    for category_id, amount in rows:
        effective[category_id] = amount
    return effective


def compute_budget_status(
    db: Session,
    user_id: uuid.UUID,
    month: dt.date,
    category_ids: Set[uuid.UUID] | None = None,
) -> list[BudgetStatusItem]:
    start, end = month_bounds(month)
    cat_stmt = select(Category).where(Category.user_id == user_id, Category.kind == "expense")
    if category_ids is None:
        cat_stmt = cat_stmt.where(Category.archived_at.is_(None))
    else:
        cat_stmt = cat_stmt.where(Category.id.in_(category_ids))
    categories = list(db.scalars(cat_stmt.order_by(Category.name)))
    ids = [c.id for c in categories]
    budgets = _effective_budgets(db, user_id, month)
    sums: dict[tuple[uuid.UUID, str], int] = {}
    rows = db.execute(
        select(Transaction.category_id, Transaction.status, func.sum(Transaction.amount))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.category_id.in_(ids),
        )
        .group_by(Transaction.category_id, Transaction.status)
    )
    for category_id, status, total in rows:
        sums[(category_id, status)] = int(total)

    items = []
    for category in categories:
        budget = budgets.get(category.id, 0)
        spent = sums.get((category.id, "confirmed"), 0)
        has_budget = budget > 0
        items.append(
            BudgetStatusItem(
                category_id=category.id,
                category_name=category.name,
                budget=budget,
                spent=spent,
                remaining=budget - spent if has_budget else None,
                percent=spent * 100 // budget if has_budget else None,
                level=budget_level(budget, spent),
                committed=sums.get((category.id, "pending"), 0),
            )
        )
    return items


def budget_effect(db: Session, user_id: uuid.UUID, txn: Transaction) -> BudgetStatusItem | None:
    if txn.type != "expense" or txn.status != "confirmed" or txn.category_id is None:
        return None
    items = compute_budget_status(db, user_id, month_start(txn.date), {txn.category_id})
    return items[0] if items else None
```

- [ ] **Step 5: Router y efecto al guardar**

`backend/app/budgets/router.py`:
```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.budgets.schemas import BudgetOut, BudgetSet, BudgetStatusOut
from app.budgets.service import compute_budget_status, set_budget
from app.core.db import get_db
from app.core.months import format_month, parse_month

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.put("", response_model=BudgetOut)
def put_budget(
    body: BudgetSet, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> BudgetOut:
    budget = set_budget(db, user.id, body)
    return BudgetOut(
        category_id=budget.category_id, month=format_month(budget.valid_from), amount=budget.amount
    )


@router.get("/status", response_model=BudgetStatusOut)
def status(
    month: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetStatusOut:
    month_date = parse_month(month)
    return BudgetStatusOut(
        month=format_month(month_date), items=compute_budget_status(db, user.id, month_date)
    )
```

En `backend/app/main.py`: incluir `budgets_router`.

En `backend/app/transactions/schemas.py`, `TransactionSaved` queda:
```python
from app.budgets.schemas import BudgetStatusItem


class TransactionSaved(BaseModel):
    transaction: TransactionOut
    budget_status: BudgetStatusItem | None = None
```

En `backend/app/transactions/router.py`, `_saved` queda:
```python
from app.budgets.service import budget_effect


def _saved(db: Session, user_id: uuid.UUID, txn: Transaction) -> TransactionSaved:
    return TransactionSaved(
        transaction=TransactionOut.model_validate(txn),
        budget_status=budget_effect(db, user_id, txn),
    )
```

- [ ] **Step 6: Migración**

Run: `uv run alembic revision --autogenerate -m "budgets" && uv run alembic upgrade head`
Expected: `create_table("budgets", ...)` con unique y los dos `CHECK`.

- [ ] **Step 7: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(budgets): add monthly category budgets with status levels and post-save alert"
```

---

### Task 10: "Págate primero" (regla de ahorro y sugerencia)

**Files:**
- Create: `backend/app/savings/__init__.py`, `models.py`, `schemas.py`, `service.py`, `router.py`
- Modify: `backend/app/models.py`, `backend/app/main.py`, `backend/app/transactions/schemas.py`, `backend/app/transactions/router.py`
- Create: migración autogenerada `savings_rules`
- Test: `backend/tests/test_savings.py`

**Interfaces:**
- Consumes: `Account`, `Category`, `Transaction`, `get_owned`, `Money`.
- Produces:
  - Modelo `SavingsRule` (`user_id` único, `mode: percent|fixed`, `value`, `trigger_category_id`, `target_account_id`, `active`).
  - `SavingsRuleIn`, `SavingsRuleOut`, `SavingsSuggestion {amount, from_account_id, to_account_id, date}`.
  - `suggest_amount(mode: str, value: int, income: int) -> int`; `get_rule`, `upsert_rule`, `delete_rule`; `savings_effect(db, user_id, txn) -> SavingsSuggestion | None`.
  - Endpoints: `GET /api/savings-rule` (regla o `null`), `PUT /api/savings-rule` (422 `SAVINGS_TRIGGER_NOT_INCOME`, `SAVINGS_TARGET_NOT_SAVINGS`), `DELETE /api/savings-rule` (204).
  - `TransactionSaved.savings_suggestion: SavingsSuggestion | None`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_savings.py`:
```python
import pytest

from app.savings.service import suggest_amount
from tests.factories import category_id, create_account


@pytest.mark.parametrize(
    ("mode", "value", "income", "expected"),
    [
        ("percent", 20, 3_000_000, 600_000),
        ("percent", 15, 1_234_567, 185_185),
        ("fixed", 500_000, 3_000_000, 500_000),
        ("fixed", 500_000, 300_000, 300_000),
    ],
)
def test_suggest_amount(mode, value, income, expected):
    assert suggest_amount(mode, value, income) == expected


@pytest.fixture
def s(client_a):
    return {
        "debit": create_account(client_a, "Bancolombia", "debit")["id"],
        "savings": create_account(client_a, "Ahorro", "savings")["id"],
        "salario": category_id(client_a, "Salario", "income"),
        "extra": category_id(client_a, "Ingreso extra", "income"),
        "comida": category_id(client_a, "Comida"),
    }


def _rule(s, **extra):
    return {"mode": "percent", "value": 20, "trigger_category_id": s["salario"],
            "target_account_id": s["savings"], **extra}


def _income(client, s, category, account="debit", amount=3_000_000):
    response = client.post(
        "/api/transactions",
        json={"type": "income", "amount": amount, "date": "2026-10-01",
              "account_id": s[account], "category_id": s[category]},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_rule_crud(client_a, s):
    assert client_a.get("/api/savings-rule").json() is None
    response = client_a.put("/api/savings-rule", json=_rule(s))
    assert response.status_code == 200
    assert response.json()["value"] == 20
    client_a.put("/api/savings-rule", json=_rule(s, mode="fixed", value=500_000))
    assert client_a.get("/api/savings-rule").json()["mode"] == "fixed"
    assert client_a.delete("/api/savings-rule").status_code == 204
    assert client_a.get("/api/savings-rule").json() is None


@pytest.mark.parametrize(
    ("overrides", "status", "code"),
    [
        ({"value": 101}, 422, "VALIDATION_ERROR"),
        ({"trigger_category_id": "COMIDA"}, 422, "SAVINGS_TRIGGER_NOT_INCOME"),
        ({"target_account_id": "DEBIT"}, 422, "SAVINGS_TARGET_NOT_SAVINGS"),
    ],
)
def test_rule_validation(client_a, s, overrides, status, code):
    resolved = {k: {"COMIDA": s["comida"], "DEBIT": s["debit"]}.get(v, v) for k, v in overrides.items()}
    response = client_a.put("/api/savings-rule", json=_rule(s, **resolved))
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_salary_triggers_suggestion(client_a, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    body = _income(client_a, s, "salario")
    assert body["savings_suggestion"] == {
        "amount": 600_000,
        "from_account_id": s["debit"],
        "to_account_id": s["savings"],
        "date": "2026-10-01",
    }


def test_other_income_or_inactive_rule_gives_no_suggestion(client_a, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    assert _income(client_a, s, "extra")["savings_suggestion"] is None
    client_a.put("/api/savings-rule", json=_rule(s, active=False))
    assert _income(client_a, s, "salario")["savings_suggestion"] is None


def test_salary_into_savings_account_gives_no_suggestion(client_a, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    assert _income(client_a, s, "salario", account="savings")["savings_suggestion"] is None


def test_accepting_suggestion_creates_savings_transfer(client_a, s):
    response = client_a.post(
        "/api/transactions",
        json={"type": "transfer", "amount": 600_000, "date": "2026-10-01",
              "account_id": s["debit"], "to_account_id": s["savings"], "source": "savings_rule"},
    )
    assert response.status_code == 201
    assert response.json()["transaction"]["source"] == "savings_rule"


def test_rule_is_per_user(client_a, client_b, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    assert client_b.get("/api/savings-rule").json() is None
    response = client_b.put("/api/savings-rule", json=_rule(s))
    assert response.status_code == 404
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_savings.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.savings'`.

- [ ] **Step 3: Modelo**

`backend/app/savings/__init__.py`: vacío.

`backend/app/savings/models.py`:
```python
import uuid

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class SavingsRule(IdTimestampMixin, Base):
    __tablename__ = "savings_rules"
    __table_args__ = (
        CheckConstraint("mode IN ('percent', 'fixed')", name="mode_valid"),
        CheckConstraint("value > 0", name="value_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    mode: Mapped[str] = mapped_column(String(10))
    value: Mapped[int] = mapped_column(BigInteger)
    trigger_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    target_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
```

Agrega `SavingsRule` a `backend/app/models.py`.

- [ ] **Step 4: Schemas, servicio, router**

`backend/app/savings/schemas.py`:
```python
import datetime as dt
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.types import Money


class SavingsRuleIn(BaseModel):
    mode: Literal["percent", "fixed"]
    value: Money
    trigger_category_id: UUID
    target_account_id: UUID
    active: bool = True

    @model_validator(mode="after")
    def percent_in_range(self) -> Self:
        if self.mode == "percent" and self.value > 100:
            raise ValueError("El porcentaje debe estar entre 1 y 100")
        return self


class SavingsRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mode: Literal["percent", "fixed"]
    value: int
    trigger_category_id: UUID
    target_account_id: UUID
    active: bool


class SavingsSuggestion(BaseModel):
    amount: int
    from_account_id: UUID
    to_account_id: UUID
    date: dt.date
```

`backend/app/savings/service.py`:
```python
import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError
from app.savings.models import SavingsRule
from app.savings.schemas import SavingsRuleIn, SavingsSuggestion
from app.transactions.models import Transaction


def suggest_amount(mode: str, value: int, income: int) -> int:
    if mode == "percent":
        return income * value // 100
    return min(value, income)


def get_rule(db: Session, user_id: uuid.UUID) -> SavingsRule | None:
    return db.scalar(select(SavingsRule).where(SavingsRule.user_id == user_id))


def upsert_rule(db: Session, user_id: uuid.UUID, data: SavingsRuleIn) -> SavingsRule:
    category = get_owned(db, Category, data.trigger_category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.kind != "income":
        raise AppError(
            422, "SAVINGS_TRIGGER_NOT_INCOME", "La regla se dispara con una categoría de ingreso"
        )
    account = get_owned(db, Account, data.target_account_id, user_id, "ACCOUNT_NOT_FOUND")
    if account.type != "savings":
        raise AppError(
            422, "SAVINGS_TARGET_NOT_SAVINGS", "El destino debe ser una cuenta de ahorro"
        )
    rule = get_rule(db, user_id)
    if rule is None:
        rule = SavingsRule(user_id=user_id, **data.model_dump())
        db.add(rule)
    else:
        for field, value in data.model_dump().items():
            setattr(rule, field, value)
    db.commit()
    return rule


def delete_rule(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(SavingsRule).where(SavingsRule.user_id == user_id))
    db.commit()


def savings_effect(db: Session, user_id: uuid.UUID, txn: Transaction) -> SavingsSuggestion | None:
    if txn.type != "income" or txn.status != "confirmed":
        return None
    rule = get_rule(db, user_id)
    if (
        rule is None
        or not rule.active
        or rule.trigger_category_id != txn.category_id
        or rule.target_account_id == txn.account_id
    ):
        return None
    amount = suggest_amount(rule.mode, rule.value, txn.amount)
    if amount <= 0:
        return None
    return SavingsSuggestion(
        amount=amount,
        from_account_id=txn.account_id,
        to_account_id=rule.target_account_id,
        date=txn.date,
    )
```

`backend/app/savings/router.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.db import get_db
from app.savings.models import SavingsRule
from app.savings.schemas import SavingsRuleIn, SavingsRuleOut
from app.savings.service import delete_rule, get_rule, upsert_rule

router = APIRouter(prefix="/api/savings-rule", tags=["savings"])


@router.get("", response_model=SavingsRuleOut | None)
def get(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SavingsRule | None:
    return get_rule(db, user.id)


@router.put("", response_model=SavingsRuleOut)
def put(
    body: SavingsRuleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SavingsRule:
    return upsert_rule(db, user.id, body)


@router.delete("", status_code=204)
def delete(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    delete_rule(db, user.id)
```

En `backend/app/main.py`: incluir `savings_router`.

En `backend/app/transactions/schemas.py` agrega a `TransactionSaved`:
```python
from app.savings.schemas import SavingsSuggestion

    savings_suggestion: SavingsSuggestion | None = None
```

En `backend/app/transactions/router.py`, `_saved` queda:
```python
from app.savings.service import savings_effect


def _saved(db: Session, user_id: uuid.UUID, txn: Transaction) -> TransactionSaved:
    return TransactionSaved(
        transaction=TransactionOut.model_validate(txn),
        budget_status=budget_effect(db, user_id, txn),
        savings_suggestion=savings_effect(db, user_id, txn),
    )
```

- [ ] **Step 5: Migración**

Run: `uv run alembic revision --autogenerate -m "savings rules" && uv run alembic upgrade head`
Expected: `create_table("savings_rules", ...)` con `uq_savings_rules_user_id` y dos `CHECK`.

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(savings): add pay-yourself-first rule and suggestion on salary income"
```

---

### Task 11: Gastos recurrentes, job diario y confirmación de pendientes

**Files:**
- Create: `backend/app/recurring/__init__.py`, `models.py`, `schemas.py`, `schedule.py`, `service.py`, `router.py`
- Modify: `backend/app/transactions/models.py` (columna `recurring_template_id` + unique), `schemas.py` (`recurring_template_id` en `TransactionOut`), `service.py` (`confirm_transaction`), `router.py` (`POST /{id}/confirm`)
- Modify: `backend/app/models.py`, `backend/app/main.py`
- Create: migración autogenerada `recurring`
- Test: `backend/tests/test_schedule.py`, `backend/tests/test_recurring.py`

**Interfaces:**
- Consumes: `Shape`, `validate_shape`, `apply_changes`, `get_transaction`, `local_today`, `clamp_day`, `add_months`, `budget_effect`, `savings_effect`, `get_now`, `get_settings().cron_token`.
- Produces:
  - Modelo `RecurringTemplate` (`user_id`, `type`, `amount`, `account_id`, `to_account_id`, `category_id`, `description`, `day_of_month` 1–31, `start_date`, `end_date`, `next_run_date`, `active`).
  - `Transaction.recurring_template_id` (FK `SET NULL`), `uq_transactions_template_date`.
  - `first_run_date(start, day) -> date`; `next_run_after(current, day) -> date`; `due_dates(next_run, day, today, end_date) -> list[date]`.
  - `RecurringCreate`, `RecurringUpdate`, `RecurringOut`; `list_templates`, `create_template`, `update_template`, `delete_template`; `run_due_templates(db, now) -> int`.
  - `confirm_transaction(db, user_id, txn_id, data) -> Transaction` (409 `TRANSACTION_NOT_PENDING`).
  - Endpoints: `GET/POST /api/recurring`, `PATCH/DELETE /api/recurring/{id}` (404 `RECURRING_NOT_FOUND`), `POST /api/transactions/{id}/confirm`, `POST /internal/jobs/recurring` (header `Authorization: Bearer <CRON_TOKEN>`; 401 `INVALID_CRON_TOKEN`).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_schedule.py`:
```python
from datetime import date

from app.recurring.schedule import due_dates, first_run_date, next_run_after


def test_first_run_date_same_month_or_next():
    assert first_run_date(date(2026, 10, 3), 5) == date(2026, 10, 5)
    assert first_run_date(date(2026, 10, 3), 3) == date(2026, 10, 3)
    assert first_run_date(date(2026, 10, 3), 1) == date(2026, 11, 1)


def test_day_31_does_not_drift():
    d = date(2026, 1, 31)
    d = next_run_after(d, 31)
    assert d == date(2026, 2, 28)
    d = next_run_after(d, 31)
    assert d == date(2026, 3, 31)
    assert next_run_after(date(2028, 1, 31), 31) == date(2028, 2, 29)


def test_due_dates_catches_up_and_respects_end_date():
    assert due_dates(date(2026, 7, 15), 15, date(2026, 10, 20), None) == [
        date(2026, 7, 15), date(2026, 8, 15), date(2026, 9, 15), date(2026, 10, 15),
    ]
    assert due_dates(date(2026, 7, 15), 15, date(2026, 10, 20), date(2026, 8, 31)) == [
        date(2026, 7, 15), date(2026, 8, 15),
    ]
    assert due_dates(date(2026, 10, 21), 21, date(2026, 10, 20), None) == []
```

`backend/tests/test_recurring.py`:
```python
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.clock import get_now
from tests.factories import category_id, create_account

JOB = "/internal/jobs/recurring"
AUTH = {"Authorization": "Bearer dev-cron-token"}


@pytest.fixture
def s(client_a):
    return {
        "debit": create_account(client_a, "Bancolombia", "debit")["id"],
        "savings": create_account(client_a, "Ahorro", "savings")["id"],
        "vivienda": category_id(client_a, "Vivienda"),
        "salario": category_id(client_a, "Salario", "income"),
    }


def _template(client, s, **extra):
    body = {"type": "expense", "amount": 1_200_000, "account_id": s["debit"],
            "category_id": s["vivienda"], "description": "Arriendo",
            "day_of_month": 15, "start_date": "2026-07-15", **extra}
    response = client.post("/api/recurring", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _run(app, at):
    app.dependency_overrides[get_now] = lambda: at
    response = TestClient(app).post(JOB, headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()["created"]


def _pending(client):
    return client.get("/api/transactions", params={"status": "pending"}).json()["items"]


def test_create_template_computes_next_run(client_a, s):
    tpl = _template(client_a, s, start_date="2026-10-20")
    assert tpl["next_run_date"] == "2026-11-15"
    assert tpl["active"] is True


def test_template_shape_is_validated(client_a, s):
    response = client_a.post(
        "/api/recurring",
        json={"type": "income", "amount": 1, "account_id": s["debit"],
              "category_id": s["vivienda"], "day_of_month": 1, "start_date": "2026-10-01"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CATEGORY_KIND_MISMATCH"


def test_end_date_before_start_is_rejected(client_a, s):
    response = client_a.post(
        "/api/recurring",
        json={"type": "expense", "amount": 1, "account_id": s["debit"],
              "category_id": s["vivienda"], "day_of_month": 1,
              "start_date": "2026-10-01", "end_date": "2026-09-01"},
    )
    assert response.status_code == 422


def test_job_requires_token(app):
    assert TestClient(app).post(JOB).status_code == 401
    response = TestClient(app).post(JOB, headers={"Authorization": "Bearer otro"})
    assert response.json()["error"]["code"] == "INVALID_CRON_TOKEN"


def test_job_catches_up_once_and_is_idempotent(app, client_a, s):
    _template(client_a, s)
    assert _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC)) == 4
    assert _run(app, datetime(2026, 10, 20, 16, 0, tzinfo=UTC)) == 0
    dates = sorted(t["date"] for t in _pending(client_a))
    assert dates == ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"]
    assert all(t["source"] == "recurring" for t in _pending(client_a))
    tpl = client_a.get("/api/recurring").json()[0]
    assert tpl["next_run_date"] == "2026-11-15"


def test_end_date_deactivates_template(app, client_a, s):
    _template(client_a, s, end_date="2026-08-31")
    assert _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC)) == 2
    assert client_a.get("/api/recurring").json()[0]["active"] is False


def test_job_uses_user_local_date(app, client_a, s):
    _template(client_a, s, day_of_month=1, start_date="2026-11-01")
    assert _run(app, datetime(2026, 11, 1, 4, 30, tzinfo=UTC)) == 0  # 23:30 del 31-oct en Bogotá
    assert _run(app, datetime(2026, 11, 1, 5, 30, tzinfo=UTC)) == 1  # 00:30 del 1-nov en Bogotá


def test_pending_is_excluded_until_confirmed(app, client_a, s):
    _template(client_a, s, start_date="2026-10-15")
    _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    balance = lambda: {a["name"]: a["balance"] for a in client_a.get("/api/accounts").json()}  # noqa: E731
    assert balance()["Bancolombia"] == 0
    pending = _pending(client_a)[0]
    response = client_a.post(f"/api/transactions/{pending['id']}/confirm", json={"amount": 1_250_000})
    assert response.status_code == 200, response.text
    assert response.json()["transaction"]["status"] == "confirmed"
    assert response.json()["transaction"]["amount"] == 1_250_000
    assert response.json()["budget_status"]["category_name"] == "Vivienda"
    assert balance()["Bancolombia"] == -1_250_000
    again = client_a.post(f"/api/transactions/{pending['id']}/confirm")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "TRANSACTION_NOT_PENDING"


def test_confirming_pending_salary_suggests_savings(app, client_a, s):
    client_a.put("/api/savings-rule", json={"mode": "percent", "value": 10,
                 "trigger_category_id": s["salario"], "target_account_id": s["savings"]})
    _template(client_a, s, type="income", amount=3_000_000, category_id=s["salario"],
              description="Sueldo", day_of_month=30, start_date="2026-09-30")
    _run(app, datetime(2026, 10, 1, 15, 0, tzinfo=UTC))
    pending = _pending(client_a)[0]
    response = client_a.post(f"/api/transactions/{pending['id']}/confirm")
    assert response.json()["savings_suggestion"]["amount"] == 300_000


def test_confirm_works_when_template_account_was_archived(app, client_a, s):
    _template(client_a, s, start_date="2026-10-15")
    _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    client_a.patch(f"/api/accounts/{s['debit']}", json={"archived": True})
    pending = _pending(client_a)[0]
    assert client_a.post(f"/api/transactions/{pending['id']}/confirm").status_code == 200


def test_discarded_pending_is_not_regenerated(app, client_a, s):
    _template(client_a, s, start_date="2026-10-15")
    _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    pending = _pending(client_a)[0]
    assert client_a.delete(f"/api/transactions/{pending['id']}").status_code == 204
    assert _run(app, datetime(2026, 10, 21, 15, 0, tzinfo=UTC)) == 0


def test_deleting_template_keeps_generated_transactions(app, client_a, s):
    tpl = _template(client_a, s, start_date="2026-10-15")
    _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    assert client_a.delete(f"/api/recurring/{tpl['id']}").status_code == 204
    pending = _pending(client_a)
    assert len(pending) == 1
    assert pending[0]["recurring_template_id"] is None


def test_update_template_and_reactivate(app, client_a, s, set_now):
    tpl = _template(client_a, s)
    client_a.patch(f"/api/recurring/{tpl['id']}", json={"active": False, "amount": 1_300_000})
    set_now(datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    response = client_a.patch(f"/api/recurring/{tpl['id']}", json={"active": True})
    assert response.json()["amount"] == 1_300_000
    assert response.json()["next_run_date"] == "2026-11-15"


def test_other_user_cannot_touch_template(client_a, client_b, s):
    tpl = _template(client_a, s)
    assert client_b.patch(f"/api/recurring/{tpl['id']}", json={"amount": 1}).status_code == 404
    response = client_b.delete(f"/api/recurring/{tpl['id']}")
    assert response.json()["error"]["code"] == "RECURRING_NOT_FOUND"
    assert client_b.get("/api/recurring").json() == []
```

Nota: `_run` sobreescribe `get_now` igual que la fixture `set_now`; el job no usa cookie, por eso va con un `TestClient` sin sesión.

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_schedule.py tests/test_recurring.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.recurring'`.

- [ ] **Step 3: Agenda (lógica pura)**

`backend/app/recurring/__init__.py`: vacío.

`backend/app/recurring/schedule.py`:
```python
from datetime import date

from app.core.months import add_months, clamp_day


def first_run_date(start: date, day_of_month: int) -> date:
    candidate = clamp_day(start.year, start.month, day_of_month)
    if candidate >= start:
        return candidate
    following = add_months(start.replace(day=1), 1)
    return clamp_day(following.year, following.month, day_of_month)


def next_run_after(current: date, day_of_month: int) -> date:
    following = add_months(current.replace(day=1), 1)
    return clamp_day(following.year, following.month, day_of_month)


def due_dates(next_run: date, day_of_month: int, today: date, end_date: date | None) -> list[date]:
    dates: list[date] = []
    current = next_run
    while current <= today and (end_date is None or current <= end_date):
        dates.append(current)
        current = next_run_after(current, day_of_month)
    return dates
```

- [ ] **Step 4: Modelos**

`backend/app/recurring/models.py`:
```python
import datetime as dt
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin
from app.transactions.models import SHAPE_CHECK


class RecurringTemplate(IdTimestampMixin, Base):
    __tablename__ = "recurring_templates"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("type IN ('income', 'expense', 'transfer')", name="type_valid"),
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_valid"),
        CheckConstraint(SHAPE_CHECK, name="shape_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(BigInteger)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    description: Mapped[str | None] = mapped_column(String(200))
    day_of_month: Mapped[int] = mapped_column(SmallInteger)
    start_date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    next_run_date: Mapped[dt.date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
```

En `backend/app/transactions/models.py` agrega a `__table_args__` (importa `UniqueConstraint`):
```python
        UniqueConstraint("recurring_template_id", "date", name="uq_transactions_template_date"),
```
y la columna:
```python
    recurring_template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("recurring_templates.id", ondelete="SET NULL")
    )
```

En `backend/app/transactions/schemas.py`, agrega a `TransactionOut`: `recurring_template_id: UUID | None`.

Agrega `RecurringTemplate` a `backend/app/models.py`.

- [ ] **Step 5: Schemas, servicio, router de recurrentes**

`backend/app/recurring/schemas.py`:
```python
import datetime as dt
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.types import Description, Money
from app.transactions.schemas import TransactionType


class RecurringCreate(BaseModel):
    type: TransactionType
    amount: Money
    account_id: UUID
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    day_of_month: int = Field(ge=1, le=31)
    start_date: dt.date
    end_date: dt.date | None = None

    @model_validator(mode="after")
    def end_after_start(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("La fecha final debe ser posterior a la inicial")
        return self


class RecurringUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Money | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    end_date: dt.date | None = None
    active: bool | None = None


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: TransactionType
    amount: int
    account_id: UUID
    to_account_id: UUID | None
    category_id: UUID | None
    description: str | None
    day_of_month: int
    start_date: dt.date
    end_date: dt.date | None
    next_run_date: dt.date
    active: bool
```

`backend/app/recurring/service.py`:
```python
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.clock import local_today
from app.core.db import get_owned
from app.core.errors import AppError
from app.recurring.models import RecurringTemplate
from app.recurring.schedule import due_dates, first_run_date, next_run_after
from app.recurring.schemas import RecurringCreate, RecurringUpdate
from app.transactions.models import Transaction
from app.transactions.validation import Shape, validate_shape

NON_NULLABLE = ("type", "amount", "account_id", "active")


def list_templates(db: Session, user_id: uuid.UUID) -> list[RecurringTemplate]:
    return list(
        db.scalars(
            select(RecurringTemplate)
            .where(RecurringTemplate.user_id == user_id)
            .order_by(RecurringTemplate.day_of_month, RecurringTemplate.created_at)
        )
    )


def create_template(db: Session, user_id: uuid.UUID, data: RecurringCreate) -> RecurringTemplate:
    validate_shape(
        db, user_id, Shape(data.type, data.account_id, data.to_account_id, data.category_id)
    )
    template = RecurringTemplate(
        user_id=user_id,
        next_run_date=first_run_date(data.start_date, data.day_of_month),
        **data.model_dump(),
    )
    db.add(template)
    db.commit()
    return template


def update_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID, data: RecurringUpdate, now: datetime
) -> RecurringTemplate:
    template = get_owned(db, RecurringTemplate, template_id, user_id, "RECURRING_NOT_FOUND")
    changes = data.model_dump(exclude_unset=True)
    for field in NON_NULLABLE:
        if field in changes and changes[field] is None:
            raise AppError(422, "FIELD_REQUIRED", f"{field} no puede ser nulo", {"field": field})
    shape = Shape(
        type=changes.get("type", template.type),
        account_id=changes.get("account_id", template.account_id),
        to_account_id=changes["to_account_id"]
        if "to_account_id" in changes
        else template.to_account_id,
        category_id=changes["category_id"] if "category_id" in changes else template.category_id,
    )
    unchanged = {
        i
        for i in (template.account_id, template.to_account_id, template.category_id)
        if i is not None
    }
    validate_shape(db, user_id, shape, allow_archived=unchanged)
    reactivating = changes.get("active") is True and not template.active
    for field, value in changes.items():
        setattr(template, field, value)
    if reactivating:
        user = db.get(User, user_id)
        today = local_today(now, user.timezone if user else "America/Bogota")
        if template.next_run_date < today:
            template.next_run_date = first_run_date(today, template.day_of_month)
    db.commit()
    return template


def delete_template(db: Session, user_id: uuid.UUID, template_id: uuid.UUID) -> None:
    db.delete(get_owned(db, RecurringTemplate, template_id, user_id, "RECURRING_NOT_FOUND"))
    db.commit()


def run_due_templates(db: Session, now: datetime) -> int:
    created = 0
    rows = db.execute(
        select(RecurringTemplate, User.timezone)
        .join(User, User.id == RecurringTemplate.user_id)
        .where(RecurringTemplate.active.is_(True))
    ).all()
    for template, timezone in rows:
        today = local_today(now, timezone)
        dates = due_dates(template.next_run_date, template.day_of_month, today, template.end_date)
        for day in dates:
            result = db.execute(
                pg_insert(Transaction)
                .values(
                    user_id=template.user_id,
                    type=template.type,
                    amount=template.amount,
                    date=day,
                    account_id=template.account_id,
                    to_account_id=template.to_account_id,
                    category_id=template.category_id,
                    description=template.description,
                    status="pending",
                    source="recurring",
                    recurring_template_id=template.id,
                )
                .on_conflict_do_nothing(constraint="uq_transactions_template_date")
            )
            created += result.rowcount
        if dates:
            template.next_run_date = next_run_after(dates[-1], template.day_of_month)
        if template.end_date is not None and template.next_run_date > template.end_date:
            template.active = False
    db.commit()
    return created
```

`backend/app/recurring/router.py`:
```python
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.recurring.models import RecurringTemplate
from app.recurring.schemas import RecurringCreate, RecurringOut, RecurringUpdate
from app.recurring.service import (
    create_template,
    delete_template,
    list_templates,
    run_due_templates,
    update_template,
)

router = APIRouter(prefix="/api/recurring", tags=["recurring"])
internal_router = APIRouter(prefix="/internal/jobs", tags=["internal"])


@router.get("", response_model=list[RecurringOut])
def list_(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[RecurringTemplate]:
    return list_templates(db, user.id)


@router.post("", status_code=201, response_model=RecurringOut)
def create(
    body: RecurringCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RecurringTemplate:
    return create_template(db, user.id, body)


@router.patch("/{template_id}", response_model=RecurringOut)
def update(
    template_id: uuid.UUID,
    body: RecurringUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> RecurringTemplate:
    return update_template(db, user.id, template_id, body, now)


@router.delete("/{template_id}", status_code=204)
def delete(
    template_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_template(db, user.id, template_id)


@internal_router.post("/recurring")
def run_recurring(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> dict[str, int]:
    expected = f"Bearer {get_settings().cron_token}"
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise AppError(401, "INVALID_CRON_TOKEN", "Token inválido")
    return {"created": run_due_templates(db, now)}
```

En `backend/app/main.py`: incluir `router` e `internal_router` de `app.recurring.router`.

- [ ] **Step 6: Confirmar pendientes**

Agrega a `backend/app/transactions/service.py`:
```python
def confirm_transaction(
    db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate
) -> Transaction:
    txn = get_transaction(db, user_id, txn_id)
    if txn.status != "pending":
        raise AppError(409, "TRANSACTION_NOT_PENDING", "Este movimiento ya está confirmado")
    apply_changes(db, user_id, txn, data)
    txn.status = "confirmed"
    db.commit()
    db.refresh(txn)
    return txn
```

Agrega a `backend/app/transactions/router.py`:
```python
@router.post("/{transaction_id}/confirm", response_model=TransactionSaved)
def confirm(
    transaction_id: uuid.UUID,
    body: TransactionUpdate | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionSaved:
    txn = confirm_transaction(db, user.id, transaction_id, body or TransactionUpdate())
    return _saved(db, user.id, txn)
```

- [ ] **Step 7: Migración**

Run: `uv run alembic revision --autogenerate -m "recurring templates" && uv run alembic upgrade head`
Expected: `create_table("recurring_templates", ...)`, `add_column("transactions", "recurring_template_id")`, FK `SET NULL` y `uq_transactions_template_date`. Verifica que la tabla `recurring_templates` se crea **antes** de la FK en `upgrade()`; si no, reordena a mano.

- [ ] **Step 8: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat(recurring): add monthly templates, idempotent daily job and pending confirmation"
```

---

### Task 12: Dashboard mensual y comparativo

**Files:**
- Create: `backend/app/dashboard/__init__.py`, `schemas.py`, `service.py`, `router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `Transaction`, `Account`, `Category`, `SavingsRule`, `compute_balances`, `compute_budget_status`, `month_bounds`, `add_months`, `format_month`, `month_start`, `parse_month`, `local_today`.
- Produces:
  - `MonthlySummary {month, income, expense, savings, balance, savings_rate, expense_by_category, budgets, pending, accounts, savings_reminder}`; `CompareOut {months: [MonthTotals], categories: [CategoryComparison]}`.
  - `monthly_summary(db, user, month) -> MonthlySummary`; `compare_months(db, user_id, until, months) -> CompareOut`.
  - `GET /api/dashboard/monthly?month=YYYY-MM` (por defecto el mes local actual), `GET /api/dashboard/compare?months=6&until=YYYY-MM` (`months` 1–24).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_dashboard.py`:
```python
import pytest

from tests.factories import category_id, create_account, create_txn, insert_txn


@pytest.fixture
def s(client_a, db):
    debit = create_account(client_a, "Bancolombia", "debit")["id"]
    savings = create_account(client_a, "Ahorro", "savings")["id"]
    card = create_account(client_a, "Nu", "credit_card")["id"]
    salario = category_id(client_a, "Salario", "income")
    comida = category_id(client_a, "Comida")
    transporte = category_id(client_a, "Transporte")
    servicios = category_id(client_a, "Servicios")
    inc = {"type": "income", "account_id": debit, "category_id": salario}
    create_txn(client_a, amount=3_000_000, date="2026-09-30", **inc)
    create_txn(client_a, type="expense", amount=200_000, date="2026-09-10",
               account_id=debit, category_id=comida)
    create_txn(client_a, amount=3_000_000, date="2026-10-01", **inc)
    create_txn(client_a, type="expense", amount=300_000, date="2026-10-05",
               account_id=debit, category_id=comida)
    create_txn(client_a, type="expense", amount=100_000, date="2026-10-06",
               account_id=card, category_id=transporte)
    create_txn(client_a, type="transfer", amount=600_000, date="2026-10-02",
               account_id=debit, to_account_id=savings)
    create_txn(client_a, type="transfer", amount=100_000, date="2026-10-20",
               account_id=savings, to_account_id=debit)
    insert_txn(db, client_a, type="expense", amount=95_000, date="2026-10-15",
               account_id=debit, category_id=servicios)
    return {"debit": debit, "savings": savings, "salario": salario}


def _monthly(client, month):
    response = client.get("/api/dashboard/monthly", params={"month": month})
    assert response.status_code == 200, response.text
    return response.json()


def test_monthly_summary(client_a, s):
    m = _monthly(client_a, "2026-10")
    assert m["month"] == "2026-10"
    assert (m["income"], m["expense"], m["savings"], m["balance"]) == (
        3_000_000, 400_000, 500_000, 2_600_000,
    )
    assert m["savings_rate"] == pytest.approx(0.1667)
    assert [(c["name"], c["amount"]) for c in m["expense_by_category"]] == [
        ("Comida", 300_000), ("Transporte", 100_000),
    ]
    assert m["pending"] == {"count": 1, "income": 0, "expense": 95_000}
    balances = {a["name"]: a["balance"] for a in m["accounts"]}
    assert balances == {"Ahorro": 500_000, "Bancolombia": 5_000_000, "Nu": -100_000}
    assert m["savings_reminder"] is False
    assert {b["category_name"] for b in m["budgets"]} >= {"Comida", "Servicios"}


def test_empty_month_has_null_savings_rate(client_a, s):
    m = _monthly(client_a, "2026-08")
    assert (m["income"], m["expense"], m["savings"]) == (0, 0, 0)
    assert m["savings_rate"] is None


def test_savings_reminder(client_a, s):
    client_a.put("/api/savings-rule", json={"mode": "percent", "value": 20,
                 "trigger_category_id": s["salario"], "target_account_id": s["savings"]})
    assert _monthly(client_a, "2026-09")["savings_reminder"] is True
    assert _monthly(client_a, "2026-10")["savings_reminder"] is False


def test_compare(client_a, s):
    response = client_a.get("/api/dashboard/compare", params={"months": 3, "until": "2026-10"})
    assert response.status_code == 200
    body = response.json()
    assert body["months"] == [
        {"month": "2026-08", "income": 0, "expense": 0, "savings": 0},
        {"month": "2026-09", "income": 3_000_000, "expense": 200_000, "savings": 0},
        {"month": "2026-10", "income": 3_000_000, "expense": 400_000, "savings": 500_000},
    ]
    cats = {c["name"]: c for c in body["categories"]}
    assert cats["Comida"]["current"] == 300_000
    assert cats["Comida"]["previous"] == 200_000
    assert cats["Comida"]["delta"] == 100_000
    assert cats["Comida"]["delta_pct"] == 50.0
    assert cats["Transporte"]["delta_pct"] is None
    assert [c["name"] for c in body["categories"]] == ["Comida", "Transporte"]


@pytest.mark.parametrize("months", [0, 25])
def test_compare_months_out_of_range(client_a, months):
    response = client_a.get("/api/dashboard/compare", params={"months": months})
    assert response.status_code == 422


def test_dashboard_is_scoped_to_user(client_b, s):
    m = _monthly(client_b, "2026-10")
    assert (m["income"], m["expense"], m["accounts"]) == (0, 0, [])
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_dashboard.py -v`
Expected: FAIL (`/api/dashboard/monthly` → 404).

- [ ] **Step 3: Schemas**

`backend/app/dashboard/__init__.py`: vacío.

`backend/app/dashboard/schemas.py`:
```python
from uuid import UUID

from pydantic import BaseModel

from app.budgets.schemas import BudgetStatusItem


class CategoryAmount(BaseModel):
    category_id: UUID
    name: str
    amount: int


class PendingSummary(BaseModel):
    count: int
    income: int
    expense: int


class AccountBalance(BaseModel):
    id: UUID
    name: str
    type: str
    balance: int


class MonthlySummary(BaseModel):
    month: str
    income: int
    expense: int
    savings: int
    balance: int
    savings_rate: float | None
    expense_by_category: list[CategoryAmount]
    budgets: list[BudgetStatusItem]
    pending: PendingSummary
    accounts: list[AccountBalance]
    savings_reminder: bool


class MonthTotals(BaseModel):
    month: str
    income: int
    expense: int
    savings: int


class CategoryComparison(BaseModel):
    category_id: UUID
    name: str
    current: int
    previous: int
    delta: int
    delta_pct: float | None


class CompareOut(BaseModel):
    months: list[MonthTotals]
    categories: list[CategoryComparison]
```

- [ ] **Step 4: Servicio**

`backend/app/dashboard/service.py`:
```python
import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session, aliased

from app.accounts.balances import compute_balances
from app.accounts.models import Account
from app.auth.models import User
from app.budgets.service import compute_budget_status
from app.categories.models import Category
from app.core.months import add_months, format_month, month_bounds
from app.dashboard.schemas import (
    AccountBalance,
    CategoryAmount,
    CategoryComparison,
    CompareOut,
    MonthlySummary,
    MonthTotals,
    PendingSummary,
)
from app.savings.models import SavingsRule
from app.transactions.models import Transaction

T = Transaction


def _month_col() -> Any:
    return cast(func.date_trunc("month", T.date), Date).label("m")


def _confirmed_in(user_id: uuid.UUID, start: dt.date, end: dt.date) -> list[Any]:
    return [T.user_id == user_id, T.status == "confirmed", T.date >= start, T.date < end]


def _totals_by_month(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date
) -> dict[dt.date, dict[str, int]]:
    m = _month_col()
    rows = db.execute(
        select(m, T.type, func.sum(T.amount))
        .where(*_confirmed_in(user_id, start, end), T.type.in_(("income", "expense")))
        .group_by(m, T.type)
    )
    totals: dict[dt.date, dict[str, int]] = {}
    for month, type_, total in rows:
        totals.setdefault(month, {"income": 0, "expense": 0})[type_] = int(total)
    return totals


def _savings_flow(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date, inbound: bool
) -> dict[dt.date, int]:
    m = _month_col()
    account = aliased(Account)
    join_col = T.to_account_id if inbound else T.account_id
    rows = db.execute(
        select(m, func.sum(T.amount))
        .join(account, account.id == join_col)
        .where(*_confirmed_in(user_id, start, end), T.type == "transfer", account.type == "savings")
        .group_by(m)
    )
    return {month: int(total) for month, total in rows}


def _savings_reminder(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date, inflow: int
) -> bool:
    rule = db.scalar(select(SavingsRule).where(SavingsRule.user_id == user_id))
    if rule is None or not rule.active or inflow > 0:
        return False
    salary_count = db.scalar(
        select(func.count())
        .select_from(T)
        .where(
            *_confirmed_in(user_id, start, end),
            T.type == "income",
            T.category_id == rule.trigger_category_id,
        )
    )
    return bool(salary_count)


def monthly_summary(db: Session, user: User, month: dt.date) -> MonthlySummary:
    start, end = month_bounds(month)
    totals = _totals_by_month(db, user.id, start, end).get(start, {"income": 0, "expense": 0})
    inflow = _savings_flow(db, user.id, start, end, inbound=True).get(start, 0)
    outflow = _savings_flow(db, user.id, start, end, inbound=False).get(start, 0)
    income, expense, savings = totals["income"], totals["expense"], inflow - outflow

    by_category = db.execute(
        select(T.category_id, Category.name, func.sum(T.amount).label("total"))
        .join(Category, Category.id == T.category_id)
        .where(*_confirmed_in(user.id, start, end), T.type == "expense")
        .group_by(T.category_id, Category.name)
        .order_by(func.sum(T.amount).desc(), Category.name)
    )
    pending_rows = db.execute(
        select(T.type, func.count(), func.coalesce(func.sum(T.amount), 0))
        .where(T.user_id == user.id, T.status == "pending", T.date >= start, T.date < end)
        .group_by(T.type)
    )
    pending = PendingSummary(count=0, income=0, expense=0)
    for type_, count, total in pending_rows:
        pending.count += int(count)
        if type_ in ("income", "expense"):
            setattr(pending, type_, int(total))

    balances = compute_balances(db, user.id)
    accounts = db.scalars(
        select(Account)
        .where(Account.user_id == user.id, Account.archived_at.is_(None))
        .order_by(Account.name)
    )
    return MonthlySummary(
        month=format_month(start),
        income=income,
        expense=expense,
        savings=savings,
        balance=income - expense,
        savings_rate=round(savings / income, 4) if income > 0 else None,
        expense_by_category=[
            CategoryAmount(category_id=cid, name=name, amount=int(total))
            for cid, name, total in by_category
        ],
        budgets=compute_budget_status(db, user.id, start),
        pending=pending,
        accounts=[
            AccountBalance(id=a.id, name=a.name, type=a.type, balance=balances.get(a.id, 0))
            for a in accounts
        ],
        savings_reminder=_savings_reminder(db, user.id, start, end, inflow),
    )


def compare_months(db: Session, user_id: uuid.UUID, until: dt.date, months: int) -> CompareOut:
    first = add_months(until, -(months - 1))
    end = add_months(until, 1)
    totals = _totals_by_month(db, user_id, first, end)
    inflow = _savings_flow(db, user_id, first, end, inbound=True)
    outflow = _savings_flow(db, user_id, first, end, inbound=False)
    series = []
    for i in range(months):
        month = add_months(first, i)
        month_totals = totals.get(month, {"income": 0, "expense": 0})
        series.append(
            MonthTotals(
                month=format_month(month),
                income=month_totals["income"],
                expense=month_totals["expense"],
                savings=inflow.get(month, 0) - outflow.get(month, 0),
            )
        )

    previous = add_months(until, -1)
    m = _month_col()
    rows = db.execute(
        select(T.category_id, Category.name, m, func.sum(T.amount))
        .join(Category, Category.id == T.category_id)
        .where(*_confirmed_in(user_id, previous, end), T.type == "expense")
        .group_by(T.category_id, Category.name, m)
    )
    per_category: dict[uuid.UUID, dict[str, Any]] = {}
    for cid, name, month, total in rows:
        entry = per_category.setdefault(cid, {"name": name, "current": 0, "previous": 0})
        entry["current" if month == until else "previous"] = int(total)
    categories = [
        CategoryComparison(
            category_id=cid,
            name=e["name"],
            current=e["current"],
            previous=e["previous"],
            delta=e["current"] - e["previous"],
            delta_pct=round((e["current"] - e["previous"]) * 100 / e["previous"], 1)
            if e["previous"] > 0
            else None,
        )
        for cid, e in per_category.items()
    ]
    categories.sort(key=lambda c: (-c.current, c.name))
    return CompareOut(months=series, categories=categories)
```

- [ ] **Step 5: Router**

`backend/app/dashboard/router.py`:
```python
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now, local_today
from app.core.db import get_db
from app.core.months import month_start, parse_month
from app.dashboard.schemas import CompareOut, MonthlySummary
from app.dashboard.service import compare_months, monthly_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _month_or_current(value: str | None, user: User, now: datetime) -> date:
    return parse_month(value) if value else month_start(local_today(now, user.timezone))


@router.get("/monthly", response_model=MonthlySummary)
def monthly(
    month: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> MonthlySummary:
    return monthly_summary(db, user, _month_or_current(month, user, now))


@router.get("/compare", response_model=CompareOut)
def compare(
    months: int = Query(6, ge=1, le=24),
    until: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> CompareOut:
    return compare_months(db, user.id, _month_or_current(until, user, now), months)
```

En `backend/app/main.py`: incluir `dashboard_router`.

- [ ] **Step 6: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(dashboard): add monthly summary and month-over-month comparison"
```

---

### Task 13: Núcleo de interpretación con IA (contexto mínimo, prompt, esquema, validación, parser fake)

**Files:**
- Create: `backend/app/ai/__init__.py`, `schemas.py`, `context.py`, `parser.py`, `validation.py`, `fake.py`, `claude.py`
- Test: `backend/tests/test_ai_core.py`

**Interfaces:**
- Consumes: `Category`, `Account`, `User`, `local_today`, `MAX_AMOUNT`.
- Produces:
  - `ParseRequest {text: 1–300, strip}`; `DraftTransaction {type, amount, date, account_id, to_account_id, category_id, description, missing_fields: list[str], notes: list[str]}` (todos opcionales).
  - `CategoryRef(id, name, kind)`, `AccountRef(id, name, type)`, `ParseContext(today, categories, accounts)`; `build_context(db, user, now) -> ParseContext` (solo activos).
  - `AIUnavailableError`; protocolos `JSONCompleter.complete(system, user, schema) -> dict | None` y `TransactionParser.parse(text, ctx) -> DraftTransaction`.
  - `to_draft(raw: dict | None, ctx) -> DraftTransaction` (mapea nombres → IDs, anula lo inválido, calcula `missing_fields`).
  - `SYSTEM_PROMPT`, `build_user_message(text, ctx) -> str`, `build_schema(ctx) -> dict`, `ClaudeTransactionParser(completer)`.
  - `FakeTransactionParser()`, `parse_amount(text) -> int | None`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_ai_core.py`:
```python
import json
import uuid
from datetime import UTC, date, datetime

import pytest

from app.ai.claude import SYSTEM_PROMPT, ClaudeTransactionParser, build_schema, build_user_message
from app.ai.context import AccountRef, CategoryRef, ParseContext, build_context
from app.ai.fake import FakeTransactionParser, parse_amount
from app.ai.validation import to_draft
from tests.factories import create_account

COMIDA, SALARIO, OTROS_IN, OTROS_EX = (uuid.uuid4() for _ in range(4))
DEBITO, NU, AHORRO = (uuid.uuid4() for _ in range(3))
CTX = ParseContext(
    today=date(2026, 10, 3),
    categories=[
        CategoryRef(COMIDA, "Comida", "expense"),
        CategoryRef(OTROS_EX, "Otros", "expense"),
        CategoryRef(SALARIO, "Salario", "income"),
        CategoryRef(OTROS_IN, "Otros", "income"),
    ],
    accounts=[
        AccountRef(DEBITO, "Bancolombia", "debit"),
        AccountRef(NU, "Nu", "credit_card"),
        AccountRef(AHORRO, "Ahorro", "savings"),
    ],
)


def _raw(**overrides):
    base = {"type": "expense", "amount": 35000, "date": "2026-10-03", "category": "Comida",
            "account": "Bancolombia", "to_account": None, "description": "Almuerzo", "notes": []}
    return {**base, **overrides}


def test_to_draft_maps_names_to_ids():
    draft = to_draft(_raw(), CTX)
    assert draft.type == "expense"
    assert draft.amount == 35000
    assert draft.date == date(2026, 10, 3)
    assert draft.category_id == COMIDA
    assert draft.account_id == DEBITO
    assert draft.missing_fields == []


def test_to_draft_is_case_insensitive_and_uses_kind_for_duplicate_names():
    draft = to_draft(_raw(type="income", category="otros", account="nu"), CTX)
    assert draft.category_id == OTROS_IN
    assert draft.account_id == NU


@pytest.mark.parametrize(
    ("overrides", "missing"),
    [
        ({"amount": None}, "amount"),
        ({"amount": 0}, "amount"),
        ({"amount": -5}, "amount"),
        ({"amount": True}, "amount"),
        ({"amount": 2_000_000_000_000}, "amount"),
        ({"date": "2028-01-01"}, "date"),
        ({"date": "ayer"}, "date"),
        ({"category": "Inventada"}, "category_id"),
        ({"category": "Salario"}, "category_id"),
        ({"account": "Davivienda"}, "account_id"),
        ({"type": "loan"}, "type"),
    ],
)
def test_to_draft_nulls_invalid_fields(overrides, missing):
    draft = to_draft(_raw(**overrides), CTX)
    assert missing in draft.missing_fields


def test_to_draft_transfer_rules():
    draft = to_draft(_raw(type="transfer", to_account="Nu", category="Comida"), CTX)
    assert draft.to_account_id == NU
    assert draft.category_id is None
    assert draft.missing_fields == []
    same = to_draft(_raw(type="transfer", to_account="Bancolombia"), CTX)
    assert "to_account_id" in same.missing_fields


def test_to_draft_handles_garbage():
    draft = to_draft(None, CTX)
    assert set(draft.missing_fields) == {"type", "amount", "date", "account_id"}
    assert to_draft({"notes": "no-es-lista"}, CTX).notes == []


def test_user_message_contains_only_minimal_context():
    msg = build_user_message('almorcé 35 mil "con la débito"', CTX)
    assert "Hoy es 2026-10-03 (sábado)" in msg
    assert "Comida" in msg and "Salario" in msg
    assert "Bancolombia (debit)" in msg
    assert json.dumps('almorcé 35 mil "con la débito"', ensure_ascii=False) in msg
    assert str(DEBITO) not in msg


def test_schema_restricts_names_and_is_stable():
    schema = build_schema(CTX)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
    category_enum = schema["properties"]["category"]["anyOf"][0]["enum"]
    assert category_enum == ["Comida", "Otros", "Salario"]
    assert schema["properties"]["account"]["anyOf"][0]["enum"] == ["Ahorro", "Bancolombia", "Nu"]
    assert build_schema(CTX) == schema


def test_schema_without_accounts_allows_only_null():
    empty = ParseContext(today=CTX.today, categories=CTX.categories, accounts=[])
    assert build_schema(empty)["properties"]["account"] == {"type": "null"}


def test_system_prompt_mentions_colombian_slang():
    for term in ("mil", "luca", "palo", "pagué la tarjeta"):
        assert term in SYSTEM_PROMPT


class RecordingCompleter:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def complete(self, system, user, schema):
        self.calls.append((system, user, schema))
        return self.result


def test_claude_parser_uses_completer_and_validates():
    completer = RecordingCompleter(_raw(amount=40000))
    draft = ClaudeTransactionParser(completer).parse("almuerzo 40 mil", CTX)
    assert draft.amount == 40000
    system, user, schema = completer.calls[0]
    assert system == SYSTEM_PROMPT
    assert "almuerzo 40 mil" in user
    assert schema == build_schema(CTX)


def test_claude_parser_with_no_result_returns_empty_draft():
    draft = ClaudeTransactionParser(RecordingCompleter(None)).parse("???", CTX)
    assert draft.amount is None
    assert "amount" in draft.missing_fields


@pytest.mark.parametrize(
    ("text", "amount"),
    [("almorcé 35 mil", 35_000), ("netflix 44.900", 44_900), ("2 palos de prima", 2_000_000),
     ("1,5 millones", 1_500_000), ("5 lucas", 5_000), ("sin monto", None)],
)
def test_fake_parse_amount(text, amount):
    assert parse_amount(text) == amount


def test_fake_parser_end_to_end():
    draft = FakeTransactionParser().parse("almorcé 35 mil comida con bancolombia", CTX)
    assert (draft.type, draft.amount, draft.category_id, draft.account_id) == (
        "expense", 35_000, COMIDA, DEBITO,
    )
    income = FakeTransactionParser().parse("me pagaron el salario 3 millones", CTX)
    assert income.type == "income" and income.category_id == SALARIO


def test_build_context_uses_local_date_and_active_items_only(client_a, db):
    create_account(client_a, "Bancolombia")
    archived = create_account(client_a, "Vieja")
    client_a.patch(f"/api/accounts/{archived['id']}", json={"archived": True})
    from app.auth.models import User

    user = db.query(User).filter_by(email="ana@example.com").one()
    ctx = build_context(db, user, datetime(2026, 11, 1, 4, 30, tzinfo=UTC))
    assert ctx.today == date(2026, 10, 31)
    assert [a.name for a in ctx.accounts] == ["Bancolombia"]
    assert len(ctx.categories) == 10
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_ai_core.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.ai'`.

- [ ] **Step 3: Schemas, contexto y protocolos**

`backend/app/ai/__init__.py`: vacío.

`backend/app/ai/schemas.py`:
```python
import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints


class ParseRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class DraftTransaction(BaseModel):
    type: Literal["income", "expense", "transfer"] | None = None
    amount: int | None = None
    date: dt.date | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: str | None = None
    missing_fields: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
```

`backend/app/ai/context.py`:
```python
import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.models import User
from app.categories.models import Category
from app.core.clock import local_today


@dataclass(frozen=True)
class CategoryRef:
    id: uuid.UUID
    name: str
    kind: str


@dataclass(frozen=True)
class AccountRef:
    id: uuid.UUID
    name: str
    type: str


@dataclass(frozen=True)
class ParseContext:
    today: date
    categories: list[CategoryRef]
    accounts: list[AccountRef]


def build_context(db: Session, user: User, now: datetime) -> ParseContext:
    categories = db.scalars(
        select(Category)
        .where(Category.user_id == user.id, Category.archived_at.is_(None))
        .order_by(Category.name)
    )
    accounts = db.scalars(
        select(Account)
        .where(Account.user_id == user.id, Account.archived_at.is_(None))
        .order_by(Account.name)
    )
    return ParseContext(
        today=local_today(now, user.timezone),
        categories=[CategoryRef(c.id, c.name, c.kind) for c in categories],
        accounts=[AccountRef(a.id, a.name, a.type) for a in accounts],
    )
```

`backend/app/ai/parser.py`:
```python
from typing import Any, Protocol

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction


class AIUnavailableError(Exception):
    """El proveedor de IA falló o no respondió a tiempo."""


class JSONCompleter(Protocol):
    def complete(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any] | None: ...


class TransactionParser(Protocol):
    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction: ...
```

- [ ] **Step 4: Validación del borrador**

`backend/app/ai/validation.py`:
```python
import datetime as dt
from typing import Any

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction
from app.core.types import MAX_AMOUNT

VALID_TYPES = ("income", "expense", "transfer")
MAX_DAYS_FROM_TODAY = 366


def _key(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip().casefold()
    return None


def _amount(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 < value <= MAX_AMOUNT else None


def _date(value: Any, today: dt.date) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if abs((parsed - today).days) <= MAX_DAYS_FROM_TODAY else None


def _text(value: Any, max_len: int) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()[:max_len] or None


def to_draft(raw: dict[str, Any] | None, ctx: ParseContext) -> DraftTransaction:
    data = raw if isinstance(raw, dict) else {}
    type_ = data.get("type") if data.get("type") in VALID_TYPES else None
    accounts = {a.name.casefold(): a for a in ctx.accounts}
    account = accounts.get(_key(data.get("account")) or "")
    to_account = accounts.get(_key(data.get("to_account")) or "") if type_ == "transfer" else None
    if to_account is not None and account is not None and to_account.id == account.id:
        to_account = None
    category = None
    if type_ in ("income", "expense"):
        wanted = _key(data.get("category"))
        category = next(
            (c for c in ctx.categories if c.kind == type_ and c.name.casefold() == wanted), None
        )
    raw_notes = data.get("notes")
    notes = (
        [n for n in (_text(x, 200) for x in raw_notes[:5]) if n]
        if isinstance(raw_notes, list)
        else []
    )
    draft = DraftTransaction(
        type=type_,
        amount=_amount(data.get("amount")),
        date=_date(data.get("date"), ctx.today),
        account_id=account.id if account else None,
        to_account_id=to_account.id if to_account else None,
        category_id=category.id if category else None,
        description=_text(data.get("description"), 200),
        notes=notes,
    )
    missing = [f for f in ("type", "amount", "date", "account_id") if getattr(draft, f) is None]
    if type_ == "transfer" and draft.to_account_id is None:
        missing.append("to_account_id")
    if type_ in ("income", "expense") and draft.category_id is None:
        missing.append("category_id")
    draft.missing_fields = missing
    return draft
```

- [ ] **Step 5: Prompt, esquema y parser de Claude**

`backend/app/ai/claude.py`:
```python
import json
from typing import Any

from app.ai.context import ParseContext
from app.ai.parser import JSONCompleter
from app.ai.schemas import DraftTransaction
from app.ai.validation import to_draft

SYSTEM_PROMPT = """\
Conviertes una frase en español colombiano sobre dinero en un borrador de transacción personal.
Responde solo con el JSON pedido.

Reglas por campo:
- type: "expense" si la persona gastó, pagó o compró algo; "income" si recibió dinero \
(sueldo, salario, prima, le pagaron, le consignaron, le devolvieron); "transfer" si movió dinero \
entre sus propias cuentas (por ejemplo "pagué la tarjeta", "pasé plata al ahorro", "saqué del cajero").
- amount: entero en pesos colombianos, sin decimales. "35 mil" = 35000; "una luca" = 1000; \
"5 lucas" = 5000; "un palo" = 1000000; "2 palos" = 2000000; "un palo doscientos" = 1200000; \
"1,5 millones" o "millón y medio" = 1500000; "$1.250.000" o "1.250.000" = 1250000. \
Si no hay un monto claro, null. Nunca inventes un monto.
- date: fecha ISO AAAA-MM-DD. Si no se menciona, usa la fecha de hoy indicada. Resuelve "ayer", \
"antier" y días de la semana ("el viernes" = el más reciente que ya pasó, o hoy) respecto a hoy.
- category: solo un nombre de la lista dada y coherente con el tipo (gasto → categoría de gasto, \
ingreso → categoría de ingreso). En transferencias, null. Si ninguna encaja con claridad, null.
- account: solo un nombre de la lista de cuentas. Es la cuenta de donde sale el dinero (gasto o \
transferencia) o a donde entra (ingreso). "con la débito" → la cuenta de tipo debit; "con la \
tarjeta" o "con la crédito" → la de tipo credit_card; "en efectivo" → la de tipo cash; "del \
cajero" sale de la de tipo debit. Si no se puede saber, null.
- to_account: solo en transferencias, la cuenta destino de la lista. "pagué la tarjeta" → la de \
tipo credit_card; "al ahorro" → la de tipo savings; "saqué del cajero" → la de tipo cash. \
En otros tipos, null.
- description: qué fue, en pocas palabras (máximo 60 caracteres), sin el monto. null si no hay.
- notes: ambigüedades breves en español; lista vacía si no hay.
"""

WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def build_user_message(text: str, ctx: ParseContext) -> str:
    expense = ", ".join(c.name for c in ctx.categories if c.kind == "expense") or "(ninguna)"
    income = ", ".join(c.name for c in ctx.categories if c.kind == "income") or "(ninguna)"
    accounts = ", ".join(f"{a.name} ({a.type})" for a in ctx.accounts) or "(ninguna)"
    return (
        f"Hoy es {ctx.today.isoformat()} ({WEEKDAYS[ctx.today.weekday()]}).\n"
        f"Categorías de gasto: {expense}\n"
        f"Categorías de ingreso: {income}\n"
        f"Cuentas: {accounts}\n"
        f"Frase: {json.dumps(text, ensure_ascii=False)}"
    )


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _name_enum(names: list[str]) -> dict[str, Any]:
    unique = sorted(set(names))
    return _nullable({"type": "string", "enum": unique}) if unique else {"type": "null"}


def build_schema(ctx: ParseContext) -> dict[str, Any]:
    account_names = [a.name for a in ctx.accounts]
    properties: dict[str, Any] = {
        "type": _nullable({"type": "string", "enum": ["income", "expense", "transfer"]}),
        "amount": _nullable({"type": "integer"}),
        "date": _nullable({"type": "string", "format": "date"}),
        "category": _name_enum([c.name for c in ctx.categories]),
        "account": _name_enum(account_names),
        "to_account": _name_enum(account_names),
        "description": _nullable({"type": "string"}),
        "notes": {"type": "array", "items": {"type": "string"}},
    }
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


class ClaudeTransactionParser:
    def __init__(self, completer: JSONCompleter) -> None:
        self._completer = completer

    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction:
        raw = self._completer.complete(SYSTEM_PROMPT, build_user_message(text, ctx), build_schema(ctx))
        return to_draft(raw, ctx)
```

- [ ] **Step 6: Parser fake (para desarrollo local y e2e)**

`backend/app/ai/fake.py`:
```python
import re

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction
from app.ai.validation import to_draft

# "millones" va antes que "mil" para que la alternancia no corte "millones" en "mil".
_AMOUNT_RE = re.compile(r"(\d+(?:[.,]\d+)*)\s*(millones|mill[oó]n|mil|lucas?|palos?)?")
_MULTIPLIERS = {
    "mil": 1_000,
    "luca": 1_000,
    "lucas": 1_000,
    "palo": 1_000_000,
    "palos": 1_000_000,
    "millones": 1_000_000,
    "millón": 1_000_000,
    "millon": 1_000_000,
}
_TRANSFER_WORDS = ("pagué la tarjeta", "pague la tarjeta", "pasé", "transferí", "transferi")
_INCOME_WORDS = ("me pagaron", "recibí", "recibi", "sueldo", "salario", "me consignaron", "ingreso")


def parse_amount(text: str) -> int | None:
    match = _AMOUNT_RE.search(text.lower())
    if match is None:
        return None
    number, unit = match.group(1), match.group(2)
    if unit:
        return round(float(number.replace(",", ".")) * _MULTIPLIERS[unit])
    return int(re.sub(r"[.,]", "", number))


def _guess_type(lower: str) -> str:
    if any(word in lower for word in _TRANSFER_WORDS):
        return "transfer"
    if any(word in lower for word in _INCOME_WORDS):
        return "income"
    return "expense"


def _first_name_in(lower: str, names: list[str]) -> str | None:
    return next((name for name in names if name.casefold() in lower), None)


class FakeTransactionParser:
    """Heurística determinista sin red; nunca se usa en producción."""

    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction:
        lower = text.lower()
        type_ = _guess_type(lower)
        kind_names = [c.name for c in ctx.categories if c.kind == type_]
        raw = {
            "type": type_,
            "amount": parse_amount(text),
            "date": ctx.today.isoformat(),
            "category": _first_name_in(lower, kind_names),
            "account": _first_name_in(lower, [a.name for a in ctx.accounts]),
            "to_account": None,
            "description": text,
            "notes": [],
        }
        return to_draft(raw, ctx)
```

- [ ] **Step 7: Ver que pasan**

Run: `uv run pytest tests/test_ai_core.py -v`
Expected: todos pasan. Luego `uv run pytest` completo: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(ai): add minimal parse context, prompt, JSON schema, draft validation and fake parser"
```

---

### Task 14: Adaptador del SDK de Anthropic y endpoint `POST /api/ai/parse-transaction`

**Files:**
- Create: `backend/app/ai/anthropic_completer.py`, `backend/app/ai/deps.py`, `backend/app/ai/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_ai_completer.py`, `backend/tests/test_ai_api.py`

**Interfaces:**
- Consumes: Task 13 completo; `app.state.ai_limiter`; `get_settings()` (`ai_parser`, `anthropic_api_key`, `claude_model`, `claude_effort`, `claude_fallbacks`, `claude_timeout_seconds`).
- Produces:
  - `AnthropicJSONCompleter(client, model, effort, fallbacks).complete(system, user, schema) -> dict | None` — usa `client.beta.messages.create(..., betas=["server-side-fallback-2026-07-01"], extra_body={"fallbacks": "default"})` si `fallbacks`, si no `client.messages.create(...)`; siempre `output_config={"format": {"type": "json_schema", "schema": ...}, "effort"?: ...}`; `None` si `stop_reason != "end_turn"` o JSON inválido; `AIUnavailableError` ante errores de conexión/timeout/estado HTTP. Loguea solo metadatos.
  - `get_parser() -> TransactionParser` (dependencia; `fake` o Claude; 503 `AI_UNAVAILABLE` si falta la key).
  - `POST /api/ai/parse-transaction` → `DraftTransaction` (429 `AI_RATE_LIMITED`, 503 `AI_UNAVAILABLE`). No persiste nada.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/test_ai_completer.py`:
```python
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import anthropic
import pytest

from app.ai.anthropic_completer import FALLBACK_BETA, AnthropicJSONCompleter
from app.ai.parser import AIUnavailableError

SCHEMA = {"type": "object"}


def _response(text, stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=120, output_tokens=40),
        _request_id="req_123",
    )


def test_uses_beta_endpoint_with_fallbacks_and_effort():
    client = MagicMock()
    client.beta.messages.create.return_value = _response('{"type": "expense"}')
    completer = AnthropicJSONCompleter(client, "claude-opus-5-5", effort="low", fallbacks=True)
    assert completer.complete("sys", "usr", SCHEMA) == {"type": "expense"}
    kwargs = client.beta.messages.create.call_args.kwargs
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["system"] == "sys"
    assert kwargs["messages"] == [{"role": "user", "content": "usr"}]
    assert kwargs["output_config"] == {
        "format": {"type": "json_schema", "schema": SCHEMA},
        "effort": "low",
    }
    assert kwargs["betas"] == [FALLBACK_BETA]
    assert kwargs["extra_body"] == {"fallbacks": "default"}
    client.messages.create.assert_not_called()


def test_without_fallbacks_and_effort_uses_plain_endpoint():
    client = MagicMock()
    client.messages.create.return_value = _response("{}")
    completer = AnthropicJSONCompleter(client, "claude-haiku-4-5", effort=None, fallbacks=False)
    assert completer.complete("s", "u", SCHEMA) == {}
    kwargs = client.messages.create.call_args.kwargs
    assert kwargs["output_config"] == {"format": {"type": "json_schema", "schema": SCHEMA}}
    assert "betas" not in kwargs


@pytest.mark.parametrize(
    ("text", "stop_reason"),
    [('{"a": 1}', "refusal"), ('{"a": 1', "max_tokens"), ("no es json", "end_turn"), ("[1]", "end_turn")],
)
def test_unusable_responses_return_none(text, stop_reason):
    client = MagicMock()
    client.beta.messages.create.return_value = _response(text, stop_reason)
    completer = AnthropicJSONCompleter(client, "m", effort=None, fallbacks=True)
    assert completer.complete("s", "u", SCHEMA) is None


@pytest.mark.parametrize(
    "error_cls", [anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.APIStatusError]
)
def test_sdk_errors_become_ai_unavailable(error_cls):
    client = MagicMock()
    client.beta.messages.create.side_effect = error_cls.__new__(error_cls)
    completer = AnthropicJSONCompleter(client, "m", effort=None, fallbacks=True)
    with pytest.raises(AIUnavailableError):
        completer.complete("s", "u", SCHEMA)


def test_logs_metadata_but_never_the_text(caplog):
    client = MagicMock()
    client.beta.messages.create.return_value = _response('{"description": "almuerzo secreto"}')
    completer = AnthropicJSONCompleter(client, "claude-opus-5-5", effort="low", fallbacks=True)
    with caplog.at_level(logging.INFO, logger="app.ai"):
        completer.complete("sys", "almorcé en el restaurante secreto", SCHEMA)
    assert "input_tokens=120" in caplog.text
    assert "req_123" in caplog.text
    assert "secreto" not in caplog.text
```

`backend/tests/test_ai_api.py`:
```python
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.ai.deps import get_parser
from app.ai.parser import AIUnavailableError
from app.ai.schemas import DraftTransaction
from app.core.ratelimit import RateLimiter
from app.transactions.models import Transaction
from tests.factories import category_id, create_account

URL = "/api/ai/parse-transaction"


class StubParser:
    def __init__(self, draft=None, error=None):
        self.draft = draft or DraftTransaction(amount=1000, missing_fields=["type"])
        self.error = error
        self.contexts = []

    def parse(self, text, ctx):
        self.contexts.append(ctx)
        if self.error:
            raise self.error
        return self.draft


@pytest.fixture
def stub(app):
    parser = StubParser()
    app.dependency_overrides[get_parser] = lambda: parser
    return parser


def test_requires_auth(client, stub):
    assert client.post(URL, json={"text": "almuerzo"}).status_code == 401


@pytest.mark.parametrize("text", ["", "   ", "x" * 301])
def test_text_length_is_validated(client_a, stub, text):
    assert client_a.post(URL, json={"text": text}).status_code == 422


def test_returns_draft_and_never_persists(client_a, stub, db):
    before = db.scalar(select(func.count()).select_from(Transaction))
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 200
    assert response.json()["amount"] == 1000
    assert response.json()["missing_fields"] == ["type"]
    assert db.scalar(select(func.count()).select_from(Transaction)) == before


def test_context_uses_user_local_date(client_a, stub, set_now):
    set_now(datetime(2026, 11, 1, 4, 30, tzinfo=UTC))
    client_a.post(URL, json={"text": "algo"})
    assert stub.contexts[0].today.isoformat() == "2026-10-31"


def test_rate_limit(app, client_a, stub):
    app.state.ai_limiter = RateLimiter(2, 3600)
    assert client_a.post(URL, json={"text": "uno"}).status_code == 200
    assert client_a.post(URL, json={"text": "dos"}).status_code == 200
    response = client_a.post(URL, json={"text": "tres"})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "AI_RATE_LIMITED"


def test_provider_failure_is_503(app, client_a):
    app.dependency_overrides[get_parser] = lambda: StubParser(error=AIUnavailableError("timeout"))
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"


def test_default_fake_parser_end_to_end(client_a):
    debit = create_account(client_a, "Bancolombia")
    response = client_a.post(URL, json={"text": "almorcé 35 mil comida con bancolombia"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["type"] == "expense"
    assert body["amount"] == 35_000
    assert body["category_id"] == category_id(client_a, "Comida")
    assert body["account_id"] == debit["id"]
    assert uuid.UUID(body["account_id"])


def test_claude_without_key_is_503(app, client_a, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.get_settings(), "ai_parser", "claude")
    monkeypatch.setattr(config.get_settings(), "anthropic_api_key", None)
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"
```

- [ ] **Step 2: Ver que fallan**

Run: `uv run pytest tests/test_ai_completer.py tests/test_ai_api.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'app.ai.anthropic_completer'`.

- [ ] **Step 3: Adaptador del SDK**

`backend/app/ai/anthropic_completer.py`:
```python
import json
import logging
import time
from typing import Any

import anthropic

from app.ai.parser import AIUnavailableError

logger = logging.getLogger("app.ai")

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 4096


class AnthropicJSONCompleter:
    """Único punto del código que habla con el SDK de Anthropic."""

    def __init__(self, client: Any, model: str, effort: str | None, fallbacks: bool) -> None:
        self._client = client
        self._model = model
        self._effort = effort
        self._fallbacks = fallbacks

    def complete(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any] | None:
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": schema}}
        if self._effort:
            output_config["effort"] = self._effort
        params: dict[str, Any] = {
            "model": self._model,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": output_config,
        }
        started = time.perf_counter()
        try:
            if self._fallbacks:
                response = self._client.beta.messages.create(
                    **params, betas=[FALLBACK_BETA], extra_body={"fallbacks": "default"}
                )
            else:
                response = self._client.messages.create(**params)
        except anthropic.APIConnectionError as exc:  # incluye APITimeoutError
            self._log(started, ok=False, error=type(exc).__name__)
            raise AIUnavailableError("conexión con Anthropic falló") from exc
        except anthropic.APIStatusError as exc:  # incluye RateLimitError y 5xx
            self._log(started, ok=False, error=type(exc).__name__)
            raise AIUnavailableError("Anthropic respondió con error") from exc

        usage = getattr(response, "usage", None)
        self._log(
            started,
            ok=response.stop_reason == "end_turn",
            stop_reason=response.stop_reason,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            request_id=getattr(response, "_request_id", None),
        )
        if response.stop_reason != "end_turn":
            return None
        text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
        if text is None:
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def _log(self, started: float, **fields: Any) -> None:
        latency_ms = int((time.perf_counter() - started) * 1000)
        parts = {"model": self._model, "latency_ms": latency_ms, **fields}
        logger.info("ai_parse %s", " ".join(f"{k}={v}" for k, v in parts.items()))
```

- [ ] **Step 4: Dependencia y router**

`backend/app/ai/deps.py`:
```python
from functools import lru_cache

import anthropic

from app.ai.anthropic_completer import AnthropicJSONCompleter
from app.ai.claude import ClaudeTransactionParser
from app.ai.fake import FakeTransactionParser
from app.ai.parser import TransactionParser
from app.core.config import get_settings
from app.core.errors import AppError


@lru_cache
def _claude_parser() -> ClaudeTransactionParser:
    settings = get_settings()
    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.claude_timeout_seconds,
        max_retries=0,
    )
    completer = AnthropicJSONCompleter(
        client,
        model=settings.claude_model,
        effort=settings.claude_effort or None,
        fallbacks=settings.claude_fallbacks,
    )
    return ClaudeTransactionParser(completer)


def get_parser() -> TransactionParser:
    settings = get_settings()
    if settings.ai_parser == "fake":
        return FakeTransactionParser()
    if not settings.anthropic_api_key:
        raise AppError(503, "AI_UNAVAILABLE", "El servicio de interpretación no está configurado")
    return _claude_parser()
```

`backend/app/ai/router.py`:
```python
import time
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.ai.context import build_context
from app.ai.deps import get_parser
from app.ai.parser import AIUnavailableError, TransactionParser
from app.ai.schemas import DraftTransaction, ParseRequest
from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.db import get_db
from app.core.errors import AppError

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/parse-transaction", response_model=DraftTransaction)
def parse_transaction(
    body: ParseRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
    parser: TransactionParser = Depends(get_parser),
) -> DraftTransaction:
    if not request.app.state.ai_limiter.hit(str(user.id), time.monotonic()):
        raise AppError(429, "AI_RATE_LIMITED", "Muchas solicitudes; intenta en un rato")
    context = build_context(db, user, now)
    try:
        return parser.parse(body.text, context)
    except AIUnavailableError as exc:
        raise AppError(503, "AI_UNAVAILABLE", "No pude interpretarlo, complétalo a mano") from exc
```

Orden importante: `get_current_user` va antes que `get_parser` en la firma para que un usuario sin sesión reciba 401 aunque falte la key.

En `backend/app/main.py`: incluir `ai_router`.

- [ ] **Step 5: Ver que pasan**

Run: `uv run pytest -v`
Expected: todos pasan.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(ai): add Anthropic structured-output adapter and parse-transaction endpoint"
```

---

### Task 15: Evaluación del parser contra la API real, Docker, cron de recurrentes y README

**Files:**
- Create: `backend/evals/__init__.py`, `backend/evals/cases.json`, `backend/evals/run_parser_eval.py`
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `backend/README.md`
- Create: `.github/workflows/recurring-cron.yml`
- Test: `backend/tests/test_eval_runner.py`

**Interfaces:**
- Consumes: `ParseContext`, `CategoryRef`, `AccountRef`, `_claude_parser`/`ClaudeTransactionParser`, `DraftTransaction`.
- Produces: `evals.run_parser_eval.EVAL_CONTEXT`, `score_case(case: dict, draft: DraftTransaction) -> list[str]` (campos que fallan), `main() -> int`; imagen Docker que migra y arranca; workflow diario que llama al job.

- [ ] **Step 1: Escribir el test que falla (lógica de puntuación, sin red)**

`backend/tests/test_eval_runner.py`:
```python
import json
from pathlib import Path

from app.ai.schemas import DraftTransaction
from evals.run_parser_eval import EVAL_CONTEXT, score_case

CASES = json.loads((Path(__file__).resolve().parents[1] / "evals" / "cases.json").read_text("utf-8"))


def _ids():
    cats = {(c.name, c.kind): c.id for c in EVAL_CONTEXT.categories}
    accs = {a.name: a.id for a in EVAL_CONTEXT.accounts}
    return cats, accs


def test_cases_file_is_well_formed():
    assert len(CASES) == 30
    allowed = {"type", "amount", "date", "category", "account", "to_account"}
    for case in CASES:
        assert case["text"]
        assert set(case["expected"]) <= allowed


def test_score_case_passes_on_match_and_reports_mismatches():
    cats, accs = _ids()
    case = {"text": "x", "expected": {"type": "expense", "amount": 35000,
                                      "category": "Comida", "account": "Bancolombia"}}
    good = DraftTransaction(type="expense", amount=35000,
                            category_id=cats[("Comida", "expense")], account_id=accs["Bancolombia"])
    assert score_case(case, good) == []
    bad = DraftTransaction(type="expense", amount=3500, category_id=None, account_id=accs["Nu"])
    assert set(score_case(case, bad)) == {"amount", "category", "account"}
```

- [ ] **Step 2: Ver que falla**

Run: `uv run pytest tests/test_eval_runner.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'evals'`.

- [ ] **Step 3: Casos y runner**

`backend/evals/__init__.py`: vacío.

`backend/evals/cases.json` (hoy = 2026-10-03, sábado):
```json
[
  {"text": "almorcé 35 mil con la débito", "expected": {"type": "expense", "amount": 35000, "date": "2026-10-03", "category": "Comida", "account": "Bancolombia"}},
  {"text": "gasté 12 mil en taxi en efectivo", "expected": {"type": "expense", "amount": 12000, "category": "Transporte", "account": "Efectivo"}},
  {"text": "pagué el arriendo, un palo doscientos", "expected": {"type": "expense", "amount": 1200000, "category": "Vivienda"}},
  {"text": "me pagaron el sueldo, 3 millones a Bancolombia", "expected": {"type": "income", "amount": 3000000, "category": "Salario", "account": "Bancolombia"}},
  {"text": "netflix 44.900 con la Nu", "expected": {"type": "expense", "amount": 44900, "category": "Suscripciones", "account": "Nu"}},
  {"text": "ayer compré medicamentos en la farmacia por 58 mil", "expected": {"type": "expense", "amount": 58000, "date": "2026-10-02", "category": "Salud"}},
  {"text": "pagué la tarjeta Nu, 450 mil desde Bancolombia", "expected": {"type": "transfer", "amount": 450000, "account": "Bancolombia", "to_account": "Nu", "category": null}},
  {"text": "pasé 600 mil al ahorro", "expected": {"type": "transfer", "amount": 600000, "to_account": "Ahorro"}},
  {"text": "cine con la novia 40 lucas", "expected": {"type": "expense", "amount": 40000, "category": "Ocio"}},
  {"text": "recibí 200 mil por un trabajito extra", "expected": {"type": "income", "amount": 200000, "category": "Ingreso extra"}},
  {"text": "el viernes pagué la luz, 95 mil", "expected": {"type": "expense", "amount": 95000, "date": "2026-10-02", "category": "Servicios"}},
  {"text": "mercado en el D1 por 187.350 con la débito", "expected": {"type": "expense", "amount": 187350, "category": "Comida", "account": "Bancolombia"}},
  {"text": "una luca de propina", "expected": {"type": "expense", "amount": 1000}},
  {"text": "antier tanqueé 80 mil", "expected": {"type": "expense", "amount": 80000, "date": "2026-10-01", "category": "Transporte"}},
  {"text": "gasté plata en algo", "expected": {"type": "expense", "amount": null}},
  {"text": "Spotify 16.900 tarjeta Nu", "expected": {"type": "expense", "amount": 16900, "category": "Suscripciones", "account": "Nu"}},
  {"text": "me consignaron 1,5 millones de un freelance", "expected": {"type": "income", "amount": 1500000, "category": "Ingreso extra"}},
  {"text": "pagué el internet 120 mil por Bancolombia", "expected": {"type": "expense", "amount": 120000, "category": "Servicios", "account": "Bancolombia"}},
  {"text": "el lunes fui al médico, consulta de 60 mil en efectivo", "expected": {"type": "expense", "amount": 60000, "date": "2026-09-28", "category": "Salud", "account": "Efectivo"}},
  {"text": "almuerzo 22 mil", "expected": {"type": "expense", "amount": 22000, "date": "2026-10-03", "category": "Comida"}},
  {"text": "saqué 100 mil del cajero", "expected": {"type": "transfer", "amount": 100000, "account": "Bancolombia", "to_account": "Efectivo"}},
  {"text": "dos palos de prima", "expected": {"type": "income", "amount": 2000000}},
  {"text": "uber 18.500 con la nu", "expected": {"type": "expense", "amount": 18500, "category": "Transporte", "account": "Nu"}},
  {"text": "compré unos tenis por 320 mil con la tarjeta", "expected": {"type": "expense", "amount": 320000, "account": "Nu"}},
  {"text": "pagué la administración del apartamento 280 mil", "expected": {"type": "expense", "amount": 280000, "category": "Vivienda"}},
  {"text": "gimnasio 89 mil", "expected": {"type": "expense", "amount": 89000}},
  {"text": "me devolvieron 50 mil de un préstamo, en efectivo", "expected": {"type": "income", "amount": 50000, "account": "Efectivo"}},
  {"text": "domicilio de pizza 45 mil", "expected": {"type": "expense", "amount": 45000, "category": "Comida"}},
  {"text": "pagué 30 mil", "expected": {"type": "expense", "amount": 30000}},
  {"text": "el agua 67.800", "expected": {"type": "expense", "amount": 67800, "category": "Servicios"}}
]
```

`backend/evals/run_parser_eval.py`:
```python
"""Evalúa el parser real contra cases.json. Gasta tokens: córrelo a mano.

Uso: ANTHROPIC_API_KEY=... uv run python -m evals.run_parser_eval
"""

import json
import statistics
import sys
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from app.ai.context import AccountRef, CategoryRef, ParseContext
from app.ai.schemas import DraftTransaction

CASES_PATH = Path(__file__).with_name("cases.json")
PASS_THRESHOLD = 0.9

_CATEGORIES = [
    ("Salario", "income"), ("Ingreso extra", "income"), ("Comida", "expense"),
    ("Transporte", "expense"), ("Vivienda", "expense"), ("Servicios", "expense"),
    ("Suscripciones", "expense"), ("Salud", "expense"), ("Ocio", "expense"), ("Otros", "expense"),
]
_ACCOUNTS = [("Bancolombia", "debit"), ("Efectivo", "cash"), ("Nu", "credit_card"), ("Ahorro", "savings")]

EVAL_CONTEXT = ParseContext(
    today=date(2026, 10, 3),
    categories=[CategoryRef(uuid.uuid5(uuid.NAMESPACE_DNS, f"c-{n}-{k}"), n, k) for n, k in _CATEGORIES],
    accounts=[AccountRef(uuid.uuid5(uuid.NAMESPACE_DNS, f"a-{n}"), n, t) for n, t in _ACCOUNTS],
)
_CATEGORY_NAMES = {c.id: c.name for c in EVAL_CONTEXT.categories}
_ACCOUNT_NAMES = {a.id: a.name for a in EVAL_CONTEXT.accounts}


def _as_names(draft: DraftTransaction) -> dict[str, Any]:
    return {
        "type": draft.type,
        "amount": draft.amount,
        "date": draft.date.isoformat() if draft.date else None,
        "category": _CATEGORY_NAMES.get(draft.category_id) if draft.category_id else None,
        "account": _ACCOUNT_NAMES.get(draft.account_id) if draft.account_id else None,
        "to_account": _ACCOUNT_NAMES.get(draft.to_account_id) if draft.to_account_id else None,
    }


def score_case(case: dict[str, Any], draft: DraftTransaction) -> list[str]:
    actual = _as_names(draft)
    return [field for field, expected in case["expected"].items() if actual[field] != expected]


def main() -> int:
    from app.ai.deps import _claude_parser
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.anthropic_api_key:
        print("Falta ANTHROPIC_API_KEY", file=sys.stderr)
        return 2
    parser = _claude_parser()
    cases = json.loads(CASES_PATH.read_text("utf-8"))
    latencies, passed = [], 0
    for case in cases:
        started = time.perf_counter()
        draft = parser.parse(case["text"], EVAL_CONTEXT)
        latencies.append(time.perf_counter() - started)
        failures = score_case(case, draft)
        if failures:
            print(f"FALLA  {case['text']!r}: {failures} -> {_as_names(draft)}")
        else:
            passed += 1
    rate = passed / len(cases)
    p95 = statistics.quantiles(latencies, n=20)[18]
    print(f"\nModelo {settings.claude_model} (effort={settings.claude_effort})")
    print(f"Aciertos: {passed}/{len(cases)} ({rate:.0%})")
    print(f"Latencia p50={statistics.median(latencies):.2f}s p95={p95:.2f}s")
    return 0 if rate >= PASS_THRESHOLD else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Ver que pasa**

Run: `uv run pytest tests/test_eval_runner.py -v`
Expected: 2 passed.

- [ ] **Step 5: Correr la evaluación real (requiere la key; gasta unos centavos)**

Run (PowerShell): `$env:ANTHROPIC_API_KEY="sk-ant-..."; uv run python -m evals.run_parser_eval`
Expected: `Aciertos: ≥27/30` y `p50` cercano o menor a 3 s. Si la latencia supera el objetivo, prueba `$env:CLAUDE_MODEL="claude-haiku-4-5"; $env:CLAUDE_EFFORT=""` (Haiku 4.5 no acepta `effort`) y compara aciertos. Si el SDK rechaza `output_config` en el endpoint beta con `TypeError`, mueve `output_config` a `extra_body` en `AnthropicJSONCompleter` y repite. Anota el resultado en el commit.

- [ ] **Step 6: Docker**

`backend/.dockerignore`:
```
.venv
__pycache__
.mypy_cache
.ruff_cache
.pytest_cache
.env
tests
evals
```

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
ENV PATH="/app/.venv/bin:$PATH"
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
```

Run (desde la raíz):
```bash
docker build -t finanzas-backend backend
docker run --rm -d --name fb -p 8001:8000 -e DATABASE_URL=postgresql+psycopg://finanzas:finanzas@host.docker.internal:5433/finanzas finanzas-backend
curl -s http://localhost:8001/health
docker stop fb
```
Expected: `{"status":"ok"}`.

- [ ] **Step 7: Cron de recurrentes**

`.github/workflows/recurring-cron.yml`:
```yaml
name: recurring-job
on:
  schedule:
    - cron: "0 11 * * *"  # 06:00 America/Bogota
  workflow_dispatch:
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - name: Generar movimientos recurrentes pendientes
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_TOKEN }}" \
            "${{ secrets.BACKEND_URL }}/internal/jobs/recurring"
```

- [ ] **Step 8: README del backend**

`backend/README.md`:
````markdown
# Finanzas — backend

## Desarrollo local

```bash
docker compose up -d db          # desde la raíz del repo
cd backend
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run python -m app.cli invite tu@email.com   # imprime el enlace de registro
uv run uvicorn app.main:app --reload
```

- Tests: `uv run pytest`
- Lint y tipos: `uv run ruff check . && uv run ruff format --check . && uv run mypy app`
- Nueva migración: `uv run alembic revision --autogenerate -m "..."` (revisa el archivo generado)
- Evaluación del parser con la API real (gasta tokens): `uv run python -m evals.run_parser_eval`
- Reset de contraseña: `uv run python -m app.cli reset-password tu@email.com`

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://...`. En Neon, cambia el prefijo `postgresql://` por `postgresql+psycopg://` y conserva `?sslmode=require` |
| `ALLOWED_ORIGIN` | Origen del frontend (p. ej. `https://finanzas.vercel.app`) |
| `COOKIE_SECURE` | `true` en producción |
| `CRON_TOKEN` | Secreto largo aleatorio; el mismo valor va en el secret `CRON_TOKEN` de GitHub |
| `AI_PARSER` | `claude` en producción, `fake` en local |
| `ANTHROPIC_API_KEY` | Solo en el backend |
| `CLAUDE_MODEL` / `CLAUDE_EFFORT` / `CLAUDE_FALLBACKS` | Por defecto `claude-opus-5-5` / `low` / `true` |

## Despliegue (Railway + Neon)

1. Crea el proyecto en Neon y copia la cadena de conexión (rama `main`).
2. En Railway, crea un servicio desde el repo con raíz `backend/` (usa el `Dockerfile`).
3. Configura las variables de la tabla. Las migraciones corren al arrancar el contenedor.
4. En GitHub, agrega los secrets `CRON_TOKEN` y `BACKEND_URL` (URL pública de Railway) para el workflow `recurring-job`.
5. Crea tu usuario: `railway run python -m app.cli invite tu@email.com`.
````

- [ ] **Step 9: Verificación final**

Run: `uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest`
Expected: sin errores; todos los tests pasan.

- [ ] **Step 10: Commit**

```bash
git add backend .github
git commit -m "chore: add parser eval, Dockerfile, recurring cron workflow and backend README"
```
