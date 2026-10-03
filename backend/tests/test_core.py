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
