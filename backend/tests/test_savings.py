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
    return {
        "mode": "percent",
        "value": 20,
        "trigger_category_id": s["salario"],
        "target_account_id": s["savings"],
        **extra,
    }


def _income(client, s, category, account="debit", amount=3_000_000):
    response = client.post(
        "/api/transactions",
        json={
            "type": "income",
            "amount": amount,
            "date": "2026-10-01",
            "account_id": s[account],
            "category_id": s[category],
        },
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
    resolved = {
        k: {"COMIDA": s["comida"], "DEBIT": s["debit"]}.get(v, v) for k, v in overrides.items()
    }
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
        json={
            "type": "transfer",
            "amount": 600_000,
            "date": "2026-10-01",
            "account_id": s["debit"],
            "to_account_id": s["savings"],
            "source": "savings_rule",
        },
    )
    assert response.status_code == 201
    assert response.json()["transaction"]["source"] == "savings_rule"


def test_rule_is_per_user(client_a, client_b, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    assert client_b.get("/api/savings-rule").json() is None
    response = client_b.put("/api/savings-rule", json=_rule(s))
    assert response.status_code == 404


def test_no_suggestion_when_target_account_is_archived(client_a, s):
    client_a.put("/api/savings-rule", json=_rule(s))
    client_a.patch(f"/api/accounts/{s['savings']}", json={"archived": True})
    created = _income(client_a, s, "salario")
    assert created["savings_suggestion"] is None
