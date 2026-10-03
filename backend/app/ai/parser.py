from typing import Any, Protocol

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction


class AIUnavailableError(Exception):
    """El proveedor de IA falló o no respondió a tiempo."""


class JSONCompleter(Protocol):
    def complete(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any] | None: ...


class TransactionParser(Protocol):
    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction: ...
