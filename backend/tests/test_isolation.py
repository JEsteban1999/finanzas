from app.ai.deps import get_parser
from app.ai.schemas import DraftTransaction
from tests.factories import category_id, create_account, insert_txn


def test_other_user_cannot_confirm_pending(client_a, client_b, db):
    debit = create_account(client_a)["id"]
    insert_txn(
        db,
        client_a,
        type="expense",
        amount=1000,
        date="2026-10-03",
        account_id=debit,
        category_id=category_id(client_a, "Comida"),
    )
    pending = client_a.get("/api/transactions", params={"status": "pending"}).json()["items"][0]
    assert client_b.post(f"/api/transactions/{pending['id']}/confirm").status_code == 404


def test_budget_status_and_compare_are_scoped(client_a, client_b):
    debit = create_account(client_a)["id"]
    comida = category_id(client_a, "Comida")
    client_a.put(
        "/api/budgets", json={"category_id": comida, "month": "2026-10", "amount": 100_000}
    )
    client_a.post(
        "/api/transactions",
        json={
            "type": "expense",
            "amount": 50_000,
            "date": "2026-10-03",
            "account_id": debit,
            "category_id": comida,
        },
    )
    items = client_b.get("/api/budgets/status", params={"month": "2026-10"}).json()["items"]
    assert all(i["spent"] == 0 and i["budget"] == 0 for i in items)
    body = client_b.get("/api/dashboard/compare", params={"months": 1, "until": "2026-10"}).json()
    assert body["months"][0]["expense"] == 0
    assert body["categories"] == []


def test_ai_context_excludes_other_users_names(app, client_a, client_b):
    seen = []

    class Spy:
        def parse(self, text, ctx):
            seen.append(ctx)
            return DraftTransaction()

    app.dependency_overrides[get_parser] = lambda: Spy()
    create_account(client_a, "Cuenta Secreta De Ana")
    client_b.post("/api/ai/parse-transaction", json={"text": "algo"})
    assert all(a.name != "Cuenta Secreta De Ana" for a in seen[0].accounts)
