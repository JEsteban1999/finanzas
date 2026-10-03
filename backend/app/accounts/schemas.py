from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.core.types import Name, SignedMoney

AccountType = Literal["cash", "debit", "savings", "credit_card"]


class AccountCreate(BaseModel):
    name: Name
    type: AccountType
    initial_balance: SignedMoney = 0


class AccountUpdate(BaseModel):
    name: Name | None = None
    initial_balance: SignedMoney | None = None
    archived: bool | None = None


class AccountOut(BaseModel):
    id: UUID
    name: str
    type: AccountType
    initial_balance: int
    archived: bool
    balance: int
