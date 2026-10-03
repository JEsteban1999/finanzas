from tests.factories import category_id, create_account, create_txn, insert_txn


def test_balances_follow_confirmed_transactions(client_a, db):
    debit = create_account(client_a, "Bancolombia", "debit", 100_000)["id"]
    savings = create_account(client_a, "Ahorro", "savings")["id"]
    card = create_account(client_a, "Nu", "credit_card")["id"]
    salario = category_id(client_a, "Salario", "income")
    comida = category_id(client_a, "Comida")
    base = {"date": "2026-10-03"}
    create_txn(
        client_a, type="income", amount=1_000_000, account_id=debit, category_id=salario, **base
    )
    create_txn(
        client_a, type="expense", amount=200_000, account_id=debit, category_id=comida, **base
    )
    create_txn(
        client_a, type="transfer", amount=300_000, account_id=debit, to_account_id=savings, **base
    )
    create_txn(client_a, type="expense", amount=50_000, account_id=card, category_id=comida, **base)
    insert_txn(
        db, client_a, type="expense", amount=999_999, account_id=debit, category_id=comida, **base
    )

    balances = {a["name"]: a["balance"] for a in client_a.get("/api/accounts").json()}
    assert balances == {"Bancolombia": 600_000, "Ahorro": 300_000, "Nu": -50_000}


def test_paying_the_card_reduces_debt(client_a):
    debit = create_account(client_a, "Bancolombia", "debit", 500_000)["id"]
    card = create_account(client_a, "Nu", "credit_card", -200_000)["id"]
    create_txn(
        client_a,
        type="transfer",
        amount=200_000,
        date="2026-10-03",
        account_id=debit,
        to_account_id=card,
    )
    balances = {a["name"]: a["balance"] for a in client_a.get("/api/accounts").json()}
    assert balances == {"Bancolombia": 300_000, "Nu": 0}
