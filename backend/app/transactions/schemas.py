import datetime as dt
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.budgets.schemas import BudgetStatusItem
from app.core.types import Description, Money

TransactionType = Literal["income", "expense", "transfer"]
TransactionStatus = Literal["confirmed", "pending"]
ClientSource = Literal["manual", "voice", "savings_rule"]


class TransactionCreate(BaseModel):
    type: TransactionType
    amount: Money
    date: dt.date
    account_id: UUID
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    source: ClientSource = "manual"


class TransactionUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Money | None = None
    date: dt.date | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: TransactionType
    amount: int
    date: dt.date
    account_id: UUID
    to_account_id: UUID | None
    category_id: UUID | None
    description: str | None
    status: TransactionStatus
    source: str
    created_at: dt.datetime


class TransactionSaved(BaseModel):
    transaction: TransactionOut
    budget_status: BudgetStatusItem | None = None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    next_cursor: str | None
