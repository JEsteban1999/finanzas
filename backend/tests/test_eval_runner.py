import json
from pathlib import Path

from app.ai.schemas import DraftTransaction
from evals.run_parser_eval import EVAL_CONTEXT, score_case

CASES = json.loads(
    (Path(__file__).resolve().parents[1] / "evals" / "cases.json").read_text("utf-8")
)


def _ids():
    cats = {(c.name, c.kind): c.id for c in EVAL_CONTEXT.categories}
    accs = {a.name: a.id for a in EVAL_CONTEXT.accounts}
    return cats, accs


def test_cases_file_is_well_formed():
    assert len(CASES) == 30
    allowed = {"type", "amount", "date", "category", "account", "to_account"}
    for case in CASES:
        assert case["text"]
        assert set(case["expected"]) <= allowed


def test_score_case_passes_on_match_and_reports_mismatches():
    cats, accs = _ids()
    case = {
        "text": "x",
        "expected": {
            "type": "expense",
            "amount": 35000,
            "category": "Comida",
            "account": "Bancolombia",
        },
    }
    good = DraftTransaction(
        type="expense",
        amount=35000,
        category_id=cats[("Comida", "expense")],
        account_id=accs["Bancolombia"],
    )
    assert score_case(case, good) == []
    bad = DraftTransaction(type="expense", amount=3500, category_id=None, account_id=accs["Nu"])
    assert set(score_case(case, bad)) == {"amount", "category", "account"}


def test_run_cases_counts_ai_unavailable_as_failure_and_continues(capsys):
    from app.ai.parser import AIUnavailableError
    from evals.run_parser_eval import run_cases

    cats, accs = _ids()

    class Stub:
        def parse(self, text, context):
            if text == "boom":
                raise AIUnavailableError()
            return DraftTransaction(type="expense", amount=100, account_id=accs["Nu"])

    cases = [
        {"text": "boom", "expected": {"amount": 100}},
        {"text": "ok", "expected": {"amount": 100}},
    ]
    passed, latencies = run_cases(Stub(), cases)
    assert passed == 1
    assert len(latencies) == 1
    assert "ERROR 'boom': AIUnavailableError" in capsys.readouterr().out
