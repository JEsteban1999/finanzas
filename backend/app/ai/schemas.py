import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints


class ParseRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class DraftTransaction(BaseModel):
    type: Literal["income", "expense", "transfer"] | None = None
    amount: int | None = None
    date: dt.date | None = None
    account_id: UUID | None = None
    to_account_id: UUID | None = None
    category_id: UUID | None = None
    description: str | None = None
    missing_fields: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
