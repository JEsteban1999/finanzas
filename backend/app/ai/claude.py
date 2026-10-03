import json
from typing import Any

from app.ai.context import ParseContext
from app.ai.parser import JSONCompleter
from app.ai.schemas import DraftTransaction
from app.ai.validation import to_draft

SYSTEM_PROMPT = """\
Conviertes una frase en español colombiano sobre dinero en un borrador de transacción personal.
Responde solo con el JSON pedido.

Reglas por campo:
- type: "expense" si la persona gastó, pagó o compró algo; "income" si recibió dinero \
(sueldo, salario, prima, le pagaron, le consignaron, le devolvieron); "transfer" si movió dinero \
entre sus propias cuentas (por ejemplo "pagué la tarjeta", "pasé plata al ahorro", "saqué del cajero").
- amount: entero en pesos colombianos, sin decimales. "35 mil" = 35000; "una luca" = 1000; \
"5 lucas" = 5000; "un palo" = 1000000; "2 palos" = 2000000; "un palo doscientos" = 1200000; \
"1,5 millones" o "millón y medio" = 1500000; "$1.250.000" o "1.250.000" = 1250000. \
Si no hay un monto claro, null. Nunca inventes un monto.
- date: fecha ISO AAAA-MM-DD. Si no se menciona, usa la fecha de hoy indicada. Resuelve "ayer", \
"antier" y días de la semana ("el viernes" = el más reciente que ya pasó, o hoy) respecto a hoy.
- category: solo un nombre de la lista dada y coherente con el tipo (gasto → categoría de gasto, \
ingreso → categoría de ingreso). En transferencias, null. Si ninguna encaja con claridad, null.
- account: solo un nombre de la lista de cuentas. Es la cuenta de donde sale el dinero (gasto o \
transferencia) o a donde entra (ingreso). "con la débito" → la cuenta de tipo debit; "con la \
tarjeta" o "con la crédito" → la de tipo credit_card; "en efectivo" → la de tipo cash; "del \
cajero" sale de la de tipo debit. Si no se puede saber, null.
- to_account: solo en transferencias, la cuenta destino de la lista. "pagué la tarjeta" → la de \
tipo credit_card; "al ahorro" → la de tipo savings; "saqué del cajero" → la de tipo cash. \
En otros tipos, null.
- description: qué fue, en pocas palabras (máximo 60 caracteres), sin el monto. null si no hay.
- notes: ambigüedades breves en español; lista vacía si no hay.
"""

WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def build_user_message(text: str, ctx: ParseContext) -> str:
    expense = ", ".join(c.name for c in ctx.categories if c.kind == "expense") or "(ninguna)"
    income = ", ".join(c.name for c in ctx.categories if c.kind == "income") or "(ninguna)"
    accounts = ", ".join(f"{a.name} ({a.type})" for a in ctx.accounts) or "(ninguna)"
    return (
        f"Hoy es {ctx.today.isoformat()} ({WEEKDAYS[ctx.today.weekday()]}).\n"
        f"Categorías de gasto: {expense}\n"
        f"Categorías de ingreso: {income}\n"
        f"Cuentas: {accounts}\n"
        f"Frase: {json.dumps(text, ensure_ascii=False)}"
    )


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


def _name_enum(names: list[str]) -> dict[str, Any]:
    unique = sorted(set(names))
    return _nullable({"type": "string", "enum": unique}) if unique else {"type": "null"}


def build_schema(ctx: ParseContext) -> dict[str, Any]:
    account_names = [a.name for a in ctx.accounts]
    properties: dict[str, Any] = {
        "type": _nullable({"type": "string", "enum": ["income", "expense", "transfer"]}),
        "amount": _nullable({"type": "integer"}),
        "date": _nullable({"type": "string", "format": "date"}),
        "category": _name_enum([c.name for c in ctx.categories]),
        "account": _name_enum(account_names),
        "to_account": _name_enum(account_names),
        "description": _nullable({"type": "string"}),
        "notes": {"type": "array", "items": {"type": "string"}},
    }
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


class ClaudeTransactionParser:
    def __init__(self, completer: JSONCompleter) -> None:
        self._completer = completer

    def parse(self, text: str, ctx: ParseContext) -> DraftTransaction:
        raw = self._completer.complete(
            SYSTEM_PROMPT, build_user_message(text, ctx), build_schema(ctx)
        )
        return to_draft(raw, ctx)
