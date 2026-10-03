import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.accounts.schemas import AccountCreate, AccountUpdate
from app.core.db import get_owned
from app.core.errors import AppError

NAME_TAKEN = AppError(409, "ACCOUNT_NAME_TAKEN", "Ya tienes una cuenta con ese nombre")


def list_accounts(db: Session, user_id: uuid.UUID, include_archived: bool) -> list[Account]:
    stmt = select(Account).where(Account.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Account.archived_at.is_(None))
    return list(db.scalars(stmt.order_by(Account.name)))


def _ensure_name_free(
    db: Session, user_id: uuid.UUID, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    stmt = select(Account.id).where(
        Account.user_id == user_id, func.lower(Account.name) == name.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Account.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise NAME_TAKEN


def create_account(db: Session, user_id: uuid.UUID, data: AccountCreate) -> Account:
    _ensure_name_free(db, user_id, data.name)
    account = Account(
        user_id=user_id, name=data.name, type=data.type, initial_balance=data.initial_balance
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise NAME_TAKEN from exc
    return account


def update_account(
    db: Session, user_id: uuid.UUID, account_id: uuid.UUID, data: AccountUpdate, now: datetime
) -> Account:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    if data.name is not None:
        _ensure_name_free(db, user_id, data.name, exclude_id=account.id)
        account.name = data.name
    if data.initial_balance is not None:
        account.initial_balance = data.initial_balance
    if data.archived is not None:
        account.archived_at = now if data.archived else None
    db.commit()
    return account


def delete_account(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> None:
    account = get_owned(db, Account, account_id, user_id, "ACCOUNT_NOT_FOUND")
    db.delete(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409,
            "ACCOUNT_IN_USE",
            "La cuenta está en uso (movimientos, recurrentes o regla de ahorro); archívala en su lugar",
        ) from exc
