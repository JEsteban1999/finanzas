import datetime as dt
import uuid
from collections.abc import Set

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.budgets.models import Budget
from app.budgets.schemas import BudgetLevel, BudgetSet, BudgetStatusItem
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError
from app.core.months import month_bounds, month_start, parse_month
from app.transactions.models import Transaction


def budget_level(budget: int, spent: int) -> BudgetLevel:
    if budget <= 0:
        return "none"
    if spent >= budget:
        return "exceeded"
    if spent * 100 >= budget * 80:
        return "warning"
    return "ok"


def set_budget(db: Session, user_id: uuid.UUID, data: BudgetSet) -> Budget:
    month = parse_month(data.month)
    category = get_owned(db, Category, data.category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.kind != "expense":
        raise AppError(
            422, "BUDGET_CATEGORY_NOT_EXPENSE", "Solo las categorías de gasto tienen presupuesto"
        )
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.category_id == category.id,
            Budget.valid_from == month,
        )
    )
    if budget is None:
        budget = Budget(
            user_id=user_id, category_id=category.id, valid_from=month, amount=data.amount
        )
        db.add(budget)
    else:
        budget.amount = data.amount
    db.commit()
    return budget


def _effective_budgets(db: Session, user_id: uuid.UUID, month: dt.date) -> dict[uuid.UUID, int]:
    rows = db.execute(
        select(Budget.category_id, Budget.amount)
        .where(Budget.user_id == user_id, Budget.valid_from <= month)
        .order_by(Budget.valid_from)
    )
    effective: dict[uuid.UUID, int] = {}
    for category_id, amount in rows:
        effective[category_id] = amount
    return effective


def compute_budget_status(
    db: Session,
    user_id: uuid.UUID,
    month: dt.date,
    category_ids: Set[uuid.UUID] | None = None,
) -> list[BudgetStatusItem]:
    start, end = month_bounds(month)
    cat_stmt = select(Category).where(Category.user_id == user_id, Category.kind == "expense")
    if category_ids is None:
        cat_stmt = cat_stmt.where(Category.archived_at.is_(None))
    else:
        cat_stmt = cat_stmt.where(Category.id.in_(category_ids))
    categories = list(db.scalars(cat_stmt.order_by(Category.name)))
    ids = [c.id for c in categories]
    budgets = _effective_budgets(db, user_id, month)
    sums: dict[tuple[uuid.UUID | None, str], int] = {}
    rows = db.execute(
        select(Transaction.category_id, Transaction.status, func.sum(Transaction.amount))
        .where(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.category_id.in_(ids),
        )
        .group_by(Transaction.category_id, Transaction.status)
    )
    for category_id, status, total in rows:
        sums[(category_id, status)] = int(total)

    items = []
    for category in categories:
        budget = budgets.get(category.id, 0)
        spent = sums.get((category.id, "confirmed"), 0)
        has_budget = budget > 0
        items.append(
            BudgetStatusItem(
                category_id=category.id,
                category_name=category.name,
                budget=budget,
                spent=spent,
                remaining=budget - spent if has_budget else None,
                percent=spent * 100 // budget if has_budget else None,
                level=budget_level(budget, spent),
                committed=sums.get((category.id, "pending"), 0),
            )
        )
    return items


def budget_effect(db: Session, user_id: uuid.UUID, txn: Transaction) -> BudgetStatusItem | None:
    if txn.type != "expense" or txn.status != "confirmed" or txn.category_id is None:
        return None
    items = compute_budget_status(db, user_id, month_start(txn.date), {txn.category_id})
    return items[0] if items else None
