from functools import lru_cache

import anthropic

from app.ai.anthropic_completer import AnthropicJSONCompleter
from app.ai.claude import ClaudeTransactionParser
from app.ai.fake import FakeTransactionParser
from app.ai.parser import TransactionParser
from app.core.config import get_settings
from app.core.errors import AppError


@lru_cache
def _claude_parser() -> ClaudeTransactionParser:
    settings = get_settings()
    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key,
        timeout=settings.claude_timeout_seconds,
        max_retries=0,
    )
    completer = AnthropicJSONCompleter(
        client,
        model=settings.claude_model,
        effort=settings.claude_effort or None,
        fallbacks=settings.claude_fallbacks,
    )
    return ClaudeTransactionParser(completer)


def get_parser() -> TransactionParser:
    settings = get_settings()
    if settings.ai_parser == "fake":
        return FakeTransactionParser()
    if not settings.anthropic_api_key:
        raise AppError(503, "AI_UNAVAILABLE", "El servicio de interpretación no está configurado")
    return _claude_parser()
