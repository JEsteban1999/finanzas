import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.ai.deps import get_parser
from app.ai.parser import AIUnavailableError
from app.ai.schemas import DraftTransaction
from app.core.ratelimit import RateLimiter
from app.transactions.models import Transaction
from tests.factories import category_id, create_account

URL = "/api/ai/parse-transaction"


class StubParser:
    def __init__(self, draft=None, error=None):
        self.draft = draft or DraftTransaction(amount=1000, missing_fields=["type"])
        self.error = error
        self.contexts = []

    def parse(self, text, ctx):
        self.contexts.append(ctx)
        if self.error:
            raise self.error
        return self.draft


@pytest.fixture
def stub(app):
    parser = StubParser()
    app.dependency_overrides[get_parser] = lambda: parser
    return parser


def test_requires_auth(client, stub):
    assert client.post(URL, json={"text": "almuerzo"}).status_code == 401


@pytest.mark.parametrize("text", ["", "   ", "x" * 301])
def test_text_length_is_validated(client_a, stub, text):
    assert client_a.post(URL, json={"text": text}).status_code == 422


def test_returns_draft_and_never_persists(client_a, stub, db):
    before = db.scalar(select(func.count()).select_from(Transaction))
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 200
    assert response.json()["amount"] == 1000
    assert response.json()["missing_fields"] == ["type"]
    assert db.scalar(select(func.count()).select_from(Transaction)) == before


def test_context_uses_user_local_date(client_a, stub, set_now):
    set_now(datetime(2026, 11, 1, 4, 30, tzinfo=UTC))
    client_a.post(URL, json={"text": "algo"})
    assert stub.contexts[0].today.isoformat() == "2026-10-31"


def test_rate_limit(app, client_a, stub):
    app.state.ai_limiter = RateLimiter(2, 3600)
    assert client_a.post(URL, json={"text": "uno"}).status_code == 200
    assert client_a.post(URL, json={"text": "dos"}).status_code == 200
    response = client_a.post(URL, json={"text": "tres"})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "AI_RATE_LIMITED"


def test_provider_failure_is_503(app, client_a):
    app.dependency_overrides[get_parser] = lambda: StubParser(error=AIUnavailableError("timeout"))
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"


def test_default_fake_parser_end_to_end(client_a):
    debit = create_account(client_a, "Bancolombia")
    response = client_a.post(URL, json={"text": "almorcé 35 mil comida con bancolombia"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["type"] == "expense"
    assert body["amount"] == 35_000
    assert body["category_id"] == category_id(client_a, "Comida")
    assert body["account_id"] == debit["id"]
    assert uuid.UUID(body["account_id"])


def test_claude_without_key_is_503(app, client_a, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.get_settings(), "ai_parser", "claude")
    monkeypatch.setattr(config.get_settings(), "anthropic_api_key", None)
    response = client_a.post(URL, json={"text": "algo"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_UNAVAILABLE"
