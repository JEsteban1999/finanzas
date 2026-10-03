from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.budgets.schemas import BudgetOut, BudgetSet, BudgetStatusOut
from app.budgets.service import compute_budget_status, set_budget
from app.core.db import get_db
from app.core.months import format_month, parse_month

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.put("", response_model=BudgetOut)
def put_budget(
    body: BudgetSet, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> BudgetOut:
    budget = set_budget(db, user.id, body)
    return BudgetOut(
        category_id=budget.category_id, month=format_month(budget.valid_from), amount=budget.amount
    )


@router.get("/status", response_model=BudgetStatusOut)
def status(
    month: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BudgetStatusOut:
    month_date = parse_month(month)
    return BudgetStatusOut(
        month=format_month(month_date), items=compute_budget_status(db, user.id, month_date)
    )
