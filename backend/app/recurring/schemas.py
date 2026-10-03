import datetime as dt
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.types import Description, Money
from app.transactions.schemas import TransactionType


class RecurringCreate(BaseModel):
    type: TransactionType
    amount: Money
    account_id: UUID
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    day_of_month: int = Field(ge=1, le=31)
    start_date: dt.date
    end_date: dt.date | None = None

    @model_validator(mode="after")
    def end_after_start(self) -> Self:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("La fecha final debe ser posterior a la inicial")
        return self


class RecurringUpdate(BaseModel):
    type: TransactionType | None = None
    amount: Money | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: Description | None = None
    end_date: dt.date | None = None
    active: bool | None = None


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: TransactionType
    amount: int
    account_id: UUID
    to_account_id: UUID | None
    category_id: UUID | None
    description: str | None
    day_of_month: int
    start_date: dt.date
    end_date: dt.date | None
    next_run_date: dt.date
    active: bool
