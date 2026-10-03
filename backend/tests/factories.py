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


def create_txn(client: TestClient, **fields: object) -> dict:
    response = client.post("/api/transactions", json=fields)
    assert response.status_code == 201, response.text
    return response.json()["transaction"]
