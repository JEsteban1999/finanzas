import uuid
from collections.abc import Set
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError


@dataclass(frozen=True)
class Shape:
    type: str
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None
    category_id: uuid.UUID | None


def _usable_account(
    db: Session, user_id: uuid.UUID, account_id: uuid.UUID, allow_archived: Set[uuid.UUID]
) -> None:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    if account.archived and account.id not in allow_archived:
        raise AppError(422, "ACCOUNT_ARCHIVED", f"La cuenta {account.name} está archivada")


def validate_shape(
    db: Session,
    user_id: uuid.UUID,
    shape: Shape,
    allow_archived: Set[uuid.UUID] = frozenset(),
) -> None:
    _usable_account(db, user_id, shape.account_id, allow_archived)
    if shape.type == "transfer":
        if shape.to_account_id is None:
            raise AppError(422, "TO_ACCOUNT_REQUIRED", "La transferencia necesita cuenta destino")
        if shape.to_account_id == shape.account_id:
            raise AppError(422, "SAME_ACCOUNT_TRANSFER", "Origen y destino deben ser distintos")
        if shape.category_id is not None:
            raise AppError(422, "CATEGORY_NOT_ALLOWED", "Las transferencias no llevan categoría")
        _usable_account(db, user_id, shape.to_account_id, allow_archived)
        return
    if shape.to_account_id is not None:
        raise AppError(422, "TO_ACCOUNT_NOT_ALLOWED", "Solo las transferencias llevan destino")
    if shape.category_id is None:
        raise AppError(422, "CATEGORY_REQUIRED", "Elige una categoría")
    category = get_owned(db, Category, shape.category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.archived and category.id not in allow_archived:
        raise AppError(422, "CATEGORY_ARCHIVED", f"La categoría {category.name} está archivada")
    if category.kind != shape.type:
        raise AppError(
            422, "CATEGORY_KIND_MISMATCH", "La categoría no corresponde al tipo de movimiento"
        )
