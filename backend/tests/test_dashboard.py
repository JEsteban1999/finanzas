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
    create_txn(
        client_a,
        type="expense",
        amount=200_000,
        date="2026-09-10",
        account_id=debit,
        category_id=comida,
    )
    create_txn(client_a, amount=3_000_000, date="2026-10-01", **inc)
    create_txn(
        client_a,
        type="expense",
        amount=300_000,
        date="2026-10-05",
        account_id=debit,
        category_id=comida,
    )
    create_txn(
        client_a,
        type="expense",
        amount=100_000,
        date="2026-10-06",
        account_id=card,
        category_id=transporte,
    )
    create_txn(
        client_a,
        type="transfer",
        amount=600_000,
        date="2026-10-02",
        account_id=debit,
        to_account_id=savings,
    )
    create_txn(
        client_a,
        type="transfer",
        amount=100_000,
        date="2026-10-20",
        account_id=savings,
        to_account_id=debit,
    )
    insert_txn(
        db,
        client_a,
        type="expense",
        amount=95_000,
        date="2026-10-15",
        account_id=debit,
        category_id=servicios,
    )
    return {"debit": debit, "savings": savings, "salario": salario}


def _monthly(client, month):
    response = client.get("/api/dashboard/monthly", params={"month": month})
    assert response.status_code == 200, response.text
    return response.json()


def test_monthly_summary(client_a, s):
    m = _monthly(client_a, "2026-10")
    assert m["month"] == "2026-10"
    assert (m["income"], m["expense"], m["savings"], m["balance"]) == (
        3_000_000,
        400_000,
        500_000,
        2_600_000,
    )
    assert m["savings_rate"] == pytest.approx(0.1667)
    assert [(c["name"], c["amount"]) for c in m["expense_by_category"]] == [
        ("Comida", 300_000),
        ("Transporte", 100_000),
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
    client_a.put(
        "/api/savings-rule",
        json={
            "mode": "percent",
            "value": 20,
            "trigger_category_id": s["salario"],
            "target_account_id": s["savings"],
        },
    )
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


def test_compare_before_year_1900_is_422_not_500(client_a):
    response = client_a.get("/api/dashboard/compare", params={"until": "1900-01", "months": 24})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_MONTH"
    assert client_a.get("/api/budgets/status", params={"month": "9999-12"}).status_code == 422
