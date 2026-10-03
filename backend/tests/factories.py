import datetime as dt
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.transactions.models import Transaction


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


def user_id(client: TestClient) -> str:
    return client.get("/api/auth/me").json()["id"]


def insert_txn(db: Session, client: TestClient, **fields: object) -> None:
    """Inserta directo en BD (p. ej. pendientes, que la API no permite crear)."""
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
