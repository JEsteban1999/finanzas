import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import anthropic
import pytest

from app.ai.anthropic_completer import FALLBACK_BETA, AnthropicJSONCompleter
from app.ai.parser import AIUnavailableError

SCHEMA = {"type": "object"}


def _response(text, stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text=text),
        ],
        usage=SimpleNamespace(input_tokens=120, output_tokens=40),
        _request_id="req_123",
    )


def test_uses_beta_endpoint_with_fallbacks_and_effort():
    client = MagicMock()
    client.beta.messages.create.return_value = _response('{"type": "expense"}')
    completer = AnthropicJSONCompleter(client, "claude-opus-5-5", effort="low", fallbacks=True)
    assert completer.complete("sys", "usr", SCHEMA) == {"type": "expense"}
    kwargs = client.beta.messages.create.call_args.kwargs
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["system"] == "sys"
    assert kwargs["messages"] == [{"role": "user", "content": "usr"}]
    assert kwargs["output_config"] == {
        "format": {"type": "json_schema", "schema": SCHEMA},
        "effort": "low",
    }
    assert kwargs["betas"] == [FALLBACK_BETA]
    assert kwargs["extra_body"] == {"fallbacks": "default"}
    client.messages.create.assert_not_called()


def test_without_fallbacks_and_effort_uses_plain_endpoint():
    client = MagicMock()
    client.messages.create.return_value = _response("{}")
    completer = AnthropicJSONCompleter(client, "claude-haiku-4-5", effort=None, fallbacks=False)
    assert completer.complete("s", "u", SCHEMA) == {}
    kwargs = client.messages.create.call_args.kwargs
    assert kwargs["output_config"] == {"format": {"type": "json_schema", "schema": SCHEMA}}
    assert "betas" not in kwargs


@pytest.mark.parametrize(
    ("text", "stop_reason"),
    [
        ('{"a": 1}', "refusal"),
        ('{"a": 1', "max_tokens"),
        ("no es json", "end_turn"),
        ("[1]", "end_turn"),
    ],
)
def test_unusable_responses_return_none(text, stop_reason):
    client = MagicMock()
    client.beta.messages.create.return_value = _response(text, stop_reason)
    completer = AnthropicJSONCompleter(client, "m", effort=None, fallbacks=True)
    assert completer.complete("s", "u", SCHEMA) is None


@pytest.mark.parametrize(
    "error_cls", [anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.APIStatusError]
)
def test_sdk_errors_become_ai_unavailable(error_cls):
    client = MagicMock()
    client.beta.messages.create.side_effect = error_cls.__new__(error_cls)
    completer = AnthropicJSONCompleter(client, "m", effort=None, fallbacks=True)
    with pytest.raises(AIUnavailableError):
        completer.complete("s", "u", SCHEMA)


def test_logs_metadata_but_never_the_text(caplog):
    client = MagicMock()
    client.beta.messages.create.return_value = _response('{"description": "almuerzo secreto"}')
    completer = AnthropicJSONCompleter(client, "claude-opus-5-5", effort="low", fallbacks=True)
    with caplog.at_level(logging.INFO, logger="app.ai"):
        completer.complete("sys", "almorcé en el restaurante secreto", SCHEMA)
    assert "input_tokens=120" in caplog.text
    assert "req_123" in caplog.text
    assert "secreto" not in caplog.text
