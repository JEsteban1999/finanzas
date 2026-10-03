import re
from typing import Any

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction
from app.ai.validation import to_draft

# "millones" va antes que "mil" para que la alternancia no corte "millones" en "mil".
_AMOUNT_RE = re.compile(r"(\d+(?:[.,]\d+)*)\s*(millones|mill[oó]n|mil|lucas?|palos?)?")
_MULTIPLIERS = {
    "mil": 1_000,
    "luca": 1_000,
    "lucas": 1_000,
    "palo": 1_000_000,
    "palos": 1_000_000,
    "millones": 1_000_000,
    "millón": 1_000_000,
    "millon": 1_000_000,
}
_TRANSFER_WORDS = ("pagué la tarjeta", "pague la tarjeta", "pasé", "transferí", "transferi")
_INCOME_WORDS = ("me pagaron", "recibí", "recibi", "sueldo", "salario", "me consignaron", "ingreso")


def parse_amount(text: str) -> int | None:
    match = _AMOUNT_RE.search(text.lower())
    if match is None:
        return None
    number, unit = match.group(1), match.group(2)
    if unit:
        return round(float(number.replace(",", ".")) * _MULTIPLIERS[unit])
    return int(re.sub(r"[.,]", "", number))


def _guess_type(lower: str) -> str:
    if any(word in lower for word in _TRANSFER_WORDS):
        return "transfer"
    if any(word in lower for word in _INCOME_WORDS):
        return "income"
    return "expense"


def _first_name_in(lower: str, names: list[str]) -> str | None:
    return next((name for name in names if name.casefold() in lower), None)


class FakeTransactionParser:
    """Heurística determinista sin red; nunca se usa en producción."""

    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction:
        lower = text.lower()
        type_ = _guess_type(lower)
        kind_names = [c.name for c in ctx.categories if c.kind == type_]
        raw: dict[str, Any] = {
            "type": type_,
            "amount": parse_amount(text),
            "date": ctx.today.isoformat(),
            "category": _first_name_in(lower, kind_names),
            "account": _first_name_in(lower, [a.name for a in ctx.accounts]),
            "to_account": None,
            "description": text,
            "notes": [],
        }
        return to_draft(raw, ctx)
