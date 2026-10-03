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
        json={
            "type": "expense",
            "amount": 80_000,
            "date": "2026-10-03",
            "account_id": s["debit"],
            "category_id": s["comida"],
        },
    )
    status = response.json()["budget_status"]
    assert status["level"] == "warning"
    assert status["remaining"] == 20_000


def test_saving_income_has_no_budget_status(client_a, s):
    response = client_a.post(
        "/api/transactions",
        json={
            "type": "income",
            "amount": 1,
            "date": "2026-10-03",
            "account_id": s["debit"],
            "category_id": s["salario"],
        },
    )
    assert response.json()["budget_status"] is None
