import datetime as dt
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from app.core.types import Money


class SavingsRuleIn(BaseModel):
    mode: Literal["percent", "fixed"]
    value: Money
    trigger_category_id: UUID
    target_account_id: UUID
    active: bool = True

    @model_validator(mode="after")
    def percent_in_range(self) -> Self:
        if self.mode == "percent" and self.value > 100:
            raise ValueError("El porcentaje debe estar entre 1 y 100")
        return self


class SavingsRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mode: Literal["percent", "fixed"]
    value: int
    trigger_category_id: UUID
    target_account_id: UUID
    active: bool


class SavingsSuggestion(BaseModel):
    amount: int
    from_account_id: UUID
    to_account_id: UUID
    date: dt.date
