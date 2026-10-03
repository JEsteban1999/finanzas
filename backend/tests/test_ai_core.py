import json
import uuid
from datetime import UTC, date, datetime

import pytest

from app.ai.claude import SYSTEM_PROMPT, ClaudeTransactionParser, build_schema, build_user_message
from app.ai.context import AccountRef, CategoryRef, ParseContext, build_context
from app.ai.fake import FakeTransactionParser, parse_amount
from app.ai.validation import to_draft
from app.auth.models import User
from tests.factories import create_account

COMIDA, SALARIO, OTROS_IN, OTROS_EX = (uuid.uuid4() for _ in range(4))
DEBITO, NU, AHORRO = (uuid.uuid4() for _ in range(3))
CTX = ParseContext(
    today=date(2026, 10, 3),
    categories=[
        CategoryRef(COMIDA, "Comida", "expense"),
        CategoryRef(OTROS_EX, "Otros", "expense"),
        CategoryRef(SALARIO, "Salario", "income"),
        CategoryRef(OTROS_IN, "Otros", "income"),
    ],
    accounts=[
        AccountRef(DEBITO, "Bancolombia", "debit"),
        AccountRef(NU, "Nu", "credit_card"),
        AccountRef(AHORRO, "Ahorro", "savings"),
    ],
)


def _raw(**overrides):
    base = {
        "type": "expense",
        "amount": 35000,
        "date": "2026-10-03",
        "category": "Comida",
        "account": "Bancolombia",
        "to_account": None,
        "description": "Almuerzo",
        "notes": [],
    }
    return {**base, **overrides}


def test_to_draft_maps_names_to_ids():
    draft = to_draft(_raw(), CTX)
    assert draft.type == "expense"
    assert draft.amount == 35000
    assert draft.date == date(2026, 10, 3)
    assert draft.category_id == COMIDA
    assert draft.account_id == DEBITO
    assert draft.missing_fields == []


def test_to_draft_is_case_insensitive_and_uses_kind_for_duplicate_names():
    draft = to_draft(_raw(type="income", category="otros", account="nu"), CTX)
    assert draft.category_id == OTROS_IN
    assert draft.account_id == NU


@pytest.mark.parametrize(
    ("overrides", "missing"),
    [
        ({"amount": None}, "amount"),
        ({"amount": 0}, "amount"),
        ({"amount": -5}, "amount"),
        ({"amount": True}, "amount"),
        ({"amount": 2_000_000_000_000}, "amount"),
        ({"date": "2028-01-01"}, "date"),
        ({"date": "ayer"}, "date"),
        ({"category": "Inventada"}, "category_id"),
        ({"category": "Salario"}, "category_id"),
        ({"account": "Davivienda"}, "account_id"),
        ({"type": "loan"}, "type"),
    ],
)
def test_to_draft_nulls_invalid_fields(overrides, missing):
    draft = to_draft(_raw(**overrides), CTX)
    assert missing in draft.missing_fields


def test_to_draft_transfer_rules():
    draft = to_draft(_raw(type="transfer", to_account="Nu", category="Comida"), CTX)
    assert draft.to_account_id == NU
    assert draft.category_id is None
    assert draft.missing_fields == []
    same = to_draft(_raw(type="transfer", to_account="Bancolombia"), CTX)
    assert "to_account_id" in same.missing_fields


def test_to_draft_handles_garbage():
    draft = to_draft(None, CTX)
    assert set(draft.missing_fields) == {"type", "amount", "date", "account_id"}
    assert to_draft({"notes": "no-es-lista"}, CTX).notes == []


def test_user_message_contains_only_minimal_context():
    msg = build_user_message('almorcé 35 mil "con la débito"', CTX)
    assert "Hoy es 2026-10-03 (sábado)" in msg
    assert "Comida" in msg and "Salario" in msg
    assert "Bancolombia (debit)" in msg
    assert json.dumps('almorcé 35 mil "con la débito"', ensure_ascii=False) in msg
    assert str(DEBITO) not in msg


def test_schema_restricts_names_and_is_stable():
    schema = build_schema(CTX)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
    category_enum = schema["properties"]["category"]["anyOf"][0]["enum"]
    assert category_enum == ["Comida", "Otros", "Salario"]
    assert schema["properties"]["account"]["anyOf"][0]["enum"] == ["Ahorro", "Bancolombia", "Nu"]
    assert build_schema(CTX) == schema


def test_schema_without_accounts_allows_only_null():
    empty = ParseContext(today=CTX.today, categories=CTX.categories, accounts=[])
    assert build_schema(empty)["properties"]["account"] == {"type": "null"}


def test_system_prompt_mentions_colombian_slang():
    for term in ("mil", "luca", "palo", "pagué la tarjeta"):
        assert term in SYSTEM_PROMPT


class RecordingCompleter:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def complete(self, system, user, schema):
        self.calls.append((system, user, schema))
        return self.result


def test_claude_parser_uses_completer_and_validates():
    completer = RecordingCompleter(_raw(amount=40000))
    draft = ClaudeTransactionParser(completer).parse("almuerzo 40 mil", CTX)
    assert draft.amount == 40000
    system, user, schema = completer.calls[0]
    assert system == SYSTEM_PROMPT
    assert "almuerzo 40 mil" in user
    assert schema == build_schema(CTX)


def test_claude_parser_with_no_result_returns_empty_draft():
    draft = ClaudeTransactionParser(RecordingCompleter(None)).parse("???", CTX)
    assert draft.amount is None
    assert "amount" in draft.missing_fields


@pytest.mark.parametrize(
    ("text", "amount"),
    [
        ("almorcé 35 mil", 35_000),
        ("netflix 44.900", 44_900),
        ("2 palos de prima", 2_000_000),
        ("1,5 millones", 1_500_000),
        ("5 lucas", 5_000),
        ("sin monto", None),
    ],
)
def test_fake_parse_amount(text, amount):
    assert parse_amount(text) == amount


def test_fake_parser_end_to_end():
    draft = FakeTransactionParser().parse("almorcé 35 mil comida con bancolombia", CTX)
    assert (draft.type, draft.amount, draft.category_id, draft.account_id) == (
        "expense",
        35_000,
        COMIDA,
        DEBITO,
    )
    income = FakeTransactionParser().parse("me pagaron el salario 3 millones", CTX)
    assert income.type == "income" and income.category_id == SALARIO


def test_build_context_uses_local_date_and_active_items_only(client_a, db):
    create_account(client_a, "Bancolombia")
    archived = create_account(client_a, "Vieja")
    client_a.patch(f"/api/accounts/{archived['id']}", json={"archived": True})

    user = db.query(User).filter_by(email="ana@example.com").one()
    ctx = build_context(db, user, datetime(2026, 11, 1, 4, 30, tzinfo=UTC))
    assert ctx.today == date(2026, 10, 31)
    assert [a.name for a in ctx.accounts] == ["Bancolombia"]
    assert len(ctx.categories) == 10
