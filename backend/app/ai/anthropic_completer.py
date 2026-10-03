import json
import logging
import time
from typing import Any

import anthropic

from app.ai.parser import AIUnavailableError

logger = logging.getLogger("app.ai")

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 4096


class AnthropicJSONCompleter:
    """Único punto del código que habla con el SDK de Anthropic."""

    def __init__(self, client: Any, model: str, effort: str | None, fallbacks: bool) -> None:
        self._client = client
        self._model = model
        self._effort = effort
        self._fallbacks = fallbacks

    def complete(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any] | None:
        output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": schema}}
        if self._effort:
            output_config["effort"] = self._effort
        params: dict[str, Any] = {
            "model": self._model,
            "max_tokens": MAX_TOKENS,
            "system": system,
            "messages": [{"role": "user", "content": user}],
            "output_config": output_config,
        }
        started = time.perf_counter()
        try:
            if self._fallbacks:
                response = self._client.beta.messages.create(
                    **params, betas=[FALLBACK_BETA], extra_body={"fallbacks": "default"}
                )
            else:
                response = self._client.messages.create(**params)
        except anthropic.APIConnectionError as exc:  # incluye APITimeoutError
            self._log(started, ok=False, error=type(exc).__name__)
            raise AIUnavailableError("conexión con Anthropic falló") from exc
        except anthropic.APIStatusError as exc:  # incluye RateLimitError y 5xx
            self._log(started, ok=False, error=type(exc).__name__)
            raise AIUnavailableError("Anthropic respondió con error") from exc

        usage = getattr(response, "usage", None)
        self._log(
            started,
            ok=response.stop_reason == "end_turn",
            stop_reason=response.stop_reason,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            request_id=getattr(response, "_request_id", None),
        )
        if response.stop_reason != "end_turn":
            return None
        text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
        if text is None:
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def _log(self, started: float, **fields: Any) -> None:
        latency_ms = int((time.perf_counter() - started) * 1000)
        parts = {"model": self._model, "latency_ms": latency_ms, **fields}
        logger.info("ai_parse %s", " ".join(f"{k}={v}" for k, v in parts.items()))
