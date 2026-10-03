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
        (
            {"type": "transfer", "category_id": None, "to_account_id": "DEBIT"},
            "SAME_ACCOUNT_TRANSFER",
        ),
        ({"type": "transfer", "to_account_id": "SAVINGS"}, "CATEGORY_NOT_ALLOWED"),
    ],
)
def test_shape_errors(client_a, setup, overrides, code):
    resolved = {
        k: {"SAVINGS": setup["savings"], "DEBIT": setup["debit"]}.get(v, v)
        if isinstance(v, str)
        else v
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
