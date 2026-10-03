import datetime as dt
from typing import Any

from app.ai.context import ParseContext
from app.ai.schemas import DraftTransaction
from app.core.types import MAX_AMOUNT

VALID_TYPES = ("income", "expense", "transfer")
MAX_DAYS_FROM_TODAY = 366


def _key(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip().casefold()
    return None


def _amount(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 < value <= MAX_AMOUNT else None


def _date(value: Any, today: dt.date) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError:
        return None
    return parsed if abs((parsed - today).days) <= MAX_DAYS_FROM_TODAY else None


def _text(value: Any, max_len: int) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip()[:max_len] or None


def to_draft(raw: dict[str, Any] | None, ctx: ParseContext) -> DraftTransaction:
    data = raw if isinstance(raw, dict) else {}
    type_ = data.get("type") if data.get("type") in VALID_TYPES else None
    accounts = {a.name.casefold(): a for a in ctx.accounts}
    account = accounts.get(_key(data.get("account")) or "")
    to_account = accounts.get(_key(data.get("to_account")) or "") if type_ == "transfer" else None
    if to_account is not None and account is not None and to_account.id == account.id:
        to_account = None
    category = None
    if type_ in ("income", "expense"):
        wanted = _key(data.get("category"))
        category = next(
            (c for c in ctx.categories if c.kind == type_ and c.name.casefold() == wanted), None
        )
    raw_notes = data.get("notes")
    notes = (
        [n for n in (_text(x, 200) for x in raw_notes[:5]) if n]
        if isinstance(raw_notes, list)
        else []
    )
    draft = DraftTransaction(
        type=type_,
        amount=_amount(data.get("amount")),
        date=_date(data.get("date"), ctx.today),
        account_id=account.id if account else None,
        to_account_id=to_account.id if to_account else None,
        category_id=category.id if category else None,
        description=_text(data.get("description"), 200),
        notes=notes,
    )
    missing = [f for f in ("type", "amount", "date", "account_id") if getattr(draft, f) is None]
    if type_ == "transfer" and draft.to_account_id is None:
        missing.append("to_account_id")
    if type_ in ("income", "expense") and draft.category_id is None:
        missing.append("category_id")
    draft.missing_fields = missing
    return draft
