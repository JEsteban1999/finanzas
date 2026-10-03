import pytest

from tests.factories import category_id, create_account, create_txn, insert_txn


@pytest.fixture
def data(client_a, db):
    debit = create_account(client_a, "Bancolombia", "debit")["id"]
    savings = create_account(client_a, "Ahorro", "savings")["id"]
    comida = category_id(client_a, "Comida")
    transporte = category_id(client_a, "Transporte")
    salario = category_id(client_a, "Salario", "income")
    create_txn(
        client_a,
        type="income",
        amount=3_000_000,
        date="2026-10-01",
        account_id=debit,
        category_id=salario,
        description="Sueldo octubre",
    )
    create_txn(
        client_a,
        type="expense",
        amount=35_000,
        date="2026-10-03",
        account_id=debit,
        category_id=comida,
        description="Almuerzo corrientazo",
    )
    create_txn(
        client_a,
        type="expense",
        amount=12_000,
        date="2026-10-04",
        account_id=debit,
        category_id=transporte,
        description="Taxi",
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
        type="expense",
        amount=20_000,
        date="2026-09-28",
        account_id=debit,
        category_id=comida,
        description="Mercado",
    )
    insert_txn(
        db,
        client_a,
        type="expense",
        amount=95_000,
        date="2026-10-15",
        account_id=debit,
        category_id=comida,
    )
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
