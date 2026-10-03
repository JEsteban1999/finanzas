import datetime as dt
import uuid
from typing import Any

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session, aliased

from app.accounts.balances import compute_balances
from app.accounts.models import Account
from app.auth.models import User
from app.budgets.service import compute_budget_status
from app.categories.models import Category
from app.core.months import add_months, format_month, month_bounds
from app.dashboard.schemas import (
    AccountBalance,
    CategoryAmount,
    CategoryComparison,
    CompareOut,
    MonthlySummary,
    MonthTotals,
    PendingSummary,
)
from app.savings.models import SavingsRule
from app.transactions.models import Transaction

T = Transaction


def _month_col() -> Any:
    return cast(func.date_trunc("month", T.date), Date).label("m")


def _confirmed_in(user_id: uuid.UUID, start: dt.date, end: dt.date) -> list[Any]:
    return [T.user_id == user_id, T.status == "confirmed", T.date >= start, T.date < end]


def _totals_by_month(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date
) -> dict[dt.date, dict[str, int]]:
    m = _month_col()
    rows = db.execute(
        select(m, T.type, func.sum(T.amount))
        .where(*_confirmed_in(user_id, start, end), T.type.in_(("income", "expense")))
        .group_by(m, T.type)
    )
    totals: dict[dt.date, dict[str, int]] = {}
    for month, type_, total in rows:
        totals.setdefault(month, {"income": 0, "expense": 0})[type_] = int(total)
    return totals


def _savings_flow(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date, inbound: bool
) -> dict[dt.date, int]:
    m = _month_col()
    account = aliased(Account)
    join_col = T.to_account_id if inbound else T.account_id
    rows = db.execute(
        select(m, func.sum(T.amount))
        .join(account, account.id == join_col)
        .where(*_confirmed_in(user_id, start, end), T.type == "transfer", account.type == "savings")
        .group_by(m)
    )
    return {month: int(total) for month, total in rows}


def _savings_reminder(
    db: Session, user_id: uuid.UUID, start: dt.date, end: dt.date, inflow: int
) -> bool:
    rule = db.scalar(select(SavingsRule).where(SavingsRule.user_id == user_id))
    if rule is None or not rule.active or inflow > 0:
        return False
    salary_count = db.scalar(
        select(func.count())
        .select_from(T)
        .where(
            *_confirmed_in(user_id, start, end),
            T.type == "income",
            T.category_id == rule.trigger_category_id,
        )
    )
    return bool(salary_count)


def monthly_summary(db: Session, user: User, month: dt.date) -> MonthlySummary:
    start, end = month_bounds(month)
    totals = _totals_by_month(db, user.id, start, end).get(start, {"income": 0, "expense": 0})
    inflow = _savings_flow(db, user.id, start, end, inbound=True).get(start, 0)
    outflow = _savings_flow(db, user.id, start, end, inbound=False).get(start, 0)
    income, expense, savings = totals["income"], totals["expense"], inflow - outflow

    by_category = db.execute(
        select(T.category_id, Category.name, func.sum(T.amount).label("total"))
        .join(Category, Category.id == T.category_id)
        .where(*_confirmed_in(user.id, start, end), T.type == "expense")
        .group_by(T.category_id, Category.name)
        .order_by(func.sum(T.amount).desc(), Category.name)
    )
    pending_rows = db.execute(
        select(T.type, func.count(), func.coalesce(func.sum(T.amount), 0))
        .where(T.user_id == user.id, T.status == "pending", T.date >= start, T.date < end)
        .group_by(T.type)
    )
    pending = PendingSummary(count=0, income=0, expense=0)
    for type_, count, total in pending_rows:
        pending.count += int(count)
        if type_ in ("income", "expense"):
            setattr(pending, type_, int(total))

    balances = compute_balances(db, user.id)
    accounts = db.scalars(
        select(Account)
        .where(Account.user_id == user.id, Account.archived_at.is_(None))
        .order_by(Account.name)
    )
    return MonthlySummary(
        month=format_month(start),
        income=income,
        expense=expense,
        savings=savings,
        balance=income - expense,
        savings_rate=round(savings / income, 4) if income > 0 else None,
        expense_by_category=[
            CategoryAmount(category_id=cid, name=name, amount=int(total))
            for cid, name, total in by_category
        ],
        budgets=compute_budget_status(db, user.id, start),
        pending=pending,
        accounts=[
            AccountBalance(id=a.id, name=a.name, type=a.type, balance=balances.get(a.id, 0))
            for a in accounts
        ],
        savings_reminder=_savings_reminder(db, user.id, start, end, inflow),
    )


def compare_months(db: Session, user_id: uuid.UUID, until: dt.date, months: int) -> CompareOut:
    first = add_months(until, -(months - 1))
    end = add_months(until, 1)
    totals = _totals_by_month(db, user_id, first, end)
    inflow = _savings_flow(db, user_id, first, end, inbound=True)
    outflow = _savings_flow(db, user_id, first, end, inbound=False)
    series = []
    for i in range(months):
        month = add_months(first, i)
        month_totals = totals.get(month, {"income": 0, "expense": 0})
        series.append(
            MonthTotals(
                month=format_month(month),
                income=month_totals["income"],
                expense=month_totals["expense"],
                savings=inflow.get(month, 0) - outflow.get(month, 0),
            )
        )

    previous = add_months(until, -1)
    m = _month_col()
    rows = db.execute(
        select(T.category_id, Category.name, m, func.sum(T.amount))
        .join(Category, Category.id == T.category_id)
        .where(*_confirmed_in(user_id, previous, end), T.type == "expense")
        .group_by(T.category_id, Category.name, m)
    )
    per_category: dict[uuid.UUID, dict[str, Any]] = {}
    for cid, name, month, total in rows:
        entry = per_category.setdefault(cid, {"name": name, "current": 0, "previous": 0})
        entry["current" if month == until else "previous"] = int(total)
    categories = [
        CategoryComparison(
            category_id=cid,
            name=e["name"],
            current=e["current"],
            previous=e["previous"],
            delta=e["current"] - e["previous"],
            delta_pct=round((e["current"] - e["previous"]) * 100 / e["previous"], 1)
            if e["previous"] > 0
            else None,
        )
        for cid, e in per_category.items()
    ]
    categories.sort(key=lambda c: (-c.current, c.name))
    return CompareOut(months=series, categories=categories)
