from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.types import MAX_AMOUNT, MonthStr

BudgetLevel = Literal["none", "ok", "warning", "exceeded"]


class BudgetSet(BaseModel):
    category_id: UUID
    month: MonthStr
    amount: int = Field(ge=0, le=MAX_AMOUNT)


class BudgetOut(BaseModel):
    category_id: UUID
    month: str
    amount: int


class BudgetStatusItem(BaseModel):
    category_id: UUID
    category_name: str
    budget: int
    spent: int
    remaining: int | None
    percent: int | None
    level: BudgetLevel
    committed: int


class BudgetStatusOut(BaseModel):
    month: str
    items: list[BudgetStatusItem]
