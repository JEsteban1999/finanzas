from uuid import UUID

from pydantic import BaseModel

from app.budgets.schemas import BudgetStatusItem


class CategoryAmount(BaseModel):
    category_id: UUID
    name: str
    amount: int


class PendingSummary(BaseModel):
    count: int
    income: int
    expense: int


class AccountBalance(BaseModel):
    id: UUID
    name: str
    type: str
    balance: int


class MonthlySummary(BaseModel):
    month: str
    income: int
    expense: int
    savings: int
    balance: int
    savings_rate: float | None
    expense_by_category: list[CategoryAmount]
    budgets: list[BudgetStatusItem]
    pending: PendingSummary
    accounts: list[AccountBalance]
    savings_reminder: bool


class MonthTotals(BaseModel):
    month: str
    income: int
    expense: int
    savings: int


class CategoryComparison(BaseModel):
    category_id: UUID
    name: str
    current: int
    previous: int
    delta: int
    delta_pct: float | None


class CompareOut(BaseModel):
    months: list[MonthTotals]
    categories: list[CategoryComparison]
