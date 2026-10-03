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
