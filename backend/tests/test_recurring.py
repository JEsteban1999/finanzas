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
    body = {
        "type": "expense",
        "amount": 1_200_000,
        "account_id": s["debit"],
        "category_id": s["vivienda"],
        "description": "Arriendo",
        "day_of_month": 15,
        "start_date": "2026-07-15",
        **extra,
    }
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
        json={
            "type": "income",
            "amount": 1,
            "account_id": s["debit"],
            "category_id": s["vivienda"],
            "day_of_month": 1,
            "start_date": "2026-10-01",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "CATEGORY_KIND_MISMATCH"


def test_end_date_before_start_is_rejected(client_a, s):
    response = client_a.post(
        "/api/recurring",
        json={
            "type": "expense",
            "amount": 1,
            "account_id": s["debit"],
            "category_id": s["vivienda"],
            "day_of_month": 1,
            "start_date": "2026-10-01",
            "end_date": "2026-09-01",
        },
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
    response = client_a.post(
        f"/api/transactions/{pending['id']}/confirm", json={"amount": 1_250_000}
    )
    assert response.status_code == 200, response.text
    assert response.json()["transaction"]["status"] == "confirmed"
    assert response.json()["transaction"]["amount"] == 1_250_000
    assert response.json()["budget_status"]["category_name"] == "Vivienda"
    assert balance()["Bancolombia"] == -1_250_000
    again = client_a.post(f"/api/transactions/{pending['id']}/confirm")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "TRANSACTION_NOT_PENDING"


def test_confirming_pending_salary_suggests_savings(app, client_a, s):
    client_a.put(
        "/api/savings-rule",
        json={
            "mode": "percent",
            "value": 10,
            "trigger_category_id": s["salario"],
            "target_account_id": s["savings"],
        },
    )
    _template(
        client_a,
        s,
        type="income",
        amount=3_000_000,
        category_id=s["salario"],
        description="Sueldo",
        day_of_month=30,
        start_date="2026-09-30",
    )
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


def test_moving_generated_transaction_onto_sibling_date_is_conflict(app, client_a, s):
    _template(client_a, s, start_date="2026-09-15")
    _run(app, datetime(2026, 10, 20, 15, 0, tzinfo=UTC))
    by_date = {t["date"]: t for t in _pending(client_a)}
    response = client_a.patch(
        f"/api/transactions/{by_date['2026-09-15']['id']}", json={"date": "2026-10-15"}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "DUPLICATE_OCCURRENCE"
    confirm = client_a.post(
        f"/api/transactions/{by_date['2026-09-15']['id']}/confirm", json={"date": "2026-10-15"}
    )
    assert confirm.status_code == 409
    assert confirm.json()["error"]["code"] == "DUPLICATE_OCCURRENCE"
    assert client_a.get("/api/accounts").status_code == 200  # session still usable


def test_cron_token_comparison_handles_non_ascii():
    from app.recurring.router import _valid_cron_token

    assert _valid_cron_token("Bearer dev-cron-token") is True
    assert _valid_cron_token("Bearer ñ") is False
    assert _valid_cron_token("Bearer ñ中") is False
    assert _valid_cron_token(None) is False
