"""Evalúa el parser real contra cases.json. Gasta tokens: córrelo a mano.

Uso: ANTHROPIC_API_KEY=... uv run python -m evals.run_parser_eval
"""

import json
import statistics
import sys
import time
import uuid
from datetime import date
from pathlib import Path
from typing import Any

from app.ai.context import AccountRef, CategoryRef, ParseContext
from app.ai.schemas import DraftTransaction

CASES_PATH = Path(__file__).with_name("cases.json")
PASS_THRESHOLD = 0.9

_CATEGORIES = [
    ("Salario", "income"),
    ("Ingreso extra", "income"),
    ("Comida", "expense"),
    ("Transporte", "expense"),
    ("Vivienda", "expense"),
    ("Servicios", "expense"),
    ("Suscripciones", "expense"),
    ("Salud", "expense"),
    ("Ocio", "expense"),
    ("Otros", "expense"),
]
_ACCOUNTS = [
    ("Bancolombia", "debit"),
    ("Efectivo", "cash"),
    ("Nu", "credit_card"),
    ("Ahorro", "savings"),
]

EVAL_CONTEXT = ParseContext(
    today=date(2026, 10, 3),
    categories=[
        CategoryRef(uuid.uuid5(uuid.NAMESPACE_DNS, f"c-{n}-{k}"), n, k) for n, k in _CATEGORIES
    ],
    accounts=[AccountRef(uuid.uuid5(uuid.NAMESPACE_DNS, f"a-{n}"), n, t) for n, t in _ACCOUNTS],
)
_CATEGORY_NAMES = {c.id: c.name for c in EVAL_CONTEXT.categories}
_ACCOUNT_NAMES = {a.id: a.name for a in EVAL_CONTEXT.accounts}


def _as_names(draft: DraftTransaction) -> dict[str, Any]:
    return {
        "type": draft.type,
        "amount": draft.amount,
        "date": draft.date.isoformat() if draft.date else None,
        "category": _CATEGORY_NAMES.get(draft.category_id) if draft.category_id else None,
        "account": _ACCOUNT_NAMES.get(draft.account_id) if draft.account_id else None,
        "to_account": _ACCOUNT_NAMES.get(draft.to_account_id) if draft.to_account_id else None,
    }


def score_case(case: dict[str, Any], draft: DraftTransaction) -> list[str]:
    actual = _as_names(draft)
    return [field for field, expected in case["expected"].items() if actual[field] != expected]


def main() -> int:
    from app.ai.deps import _claude_parser
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.anthropic_api_key:
        print("Falta ANTHROPIC_API_KEY", file=sys.stderr)
        return 2
    parser = _claude_parser()
    cases = json.loads(CASES_PATH.read_text("utf-8"))
    latencies, passed = [], 0
    for case in cases:
        started = time.perf_counter()
        draft = parser.parse(case["text"], EVAL_CONTEXT)
        latencies.append(time.perf_counter() - started)
        failures = score_case(case, draft)
        if failures:
            print(f"FALLA  {case['text']!r}: {failures} -> {_as_names(draft)}")
        else:
            passed += 1
    rate = passed / len(cases)
    p95 = statistics.quantiles(latencies, n=20)[18]
    print(f"\nModelo {settings.claude_model} (effort={settings.claude_effort})")
    print(f"Aciertos: {passed}/{len(cases)} ({rate:.0%})")
    print(f"Latencia p50={statistics.median(latencies):.2f}s p95={p95:.2f}s")
    return 0 if rate >= PASS_THRESHOLD else 1


if __name__ == "__main__":
    raise SystemExit(main())
