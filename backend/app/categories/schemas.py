from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.types import Name

CategoryKind = Literal["income", "expense"]


class CategoryCreate(BaseModel):
    name: Name
    kind: CategoryKind


class CategoryUpdate(BaseModel):
    name: Name | None = None
    archived: bool | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    kind: CategoryKind
    archived: bool
