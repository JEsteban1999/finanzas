import uuid

from sqlalchemy.orm import Session

from app.core.db import get_owned
from app.core.errors import AppError
from app.transactions.models import Transaction
from app.transactions.schemas import TransactionCreate, TransactionUpdate
from app.transactions.validation import Shape, validate_shape

NON_NULLABLE = ("type", "amount", "date", "account_id")


def create_transaction(db: Session, user_id: uuid.UUID, data: TransactionCreate) -> Transaction:
    validate_shape(
        db, user_id, Shape(data.type, data.account_id, data.to_account_id, data.category_id)
    )
    txn = Transaction(user_id=user_id, status="confirmed", **data.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def get_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> Transaction:
    return get_owned(db, Transaction, txn_id, user_id, "TRANSACTION_NOT_FOUND")


def apply_changes(
    db: Session, user_id: uuid.UUID, txn: Transaction, data: TransactionUpdate
) -> None:
    changes = data.model_dump(exclude_unset=True)
    for field in NON_NULLABLE:
        if field in changes and changes[field] is None:
            raise AppError(422, "FIELD_REQUIRED", f"{field} no puede ser nulo", {"field": field})
    shape = Shape(
        type=changes.get("type", txn.type),
        account_id=changes.get("account_id", txn.account_id),
        to_account_id=changes["to_account_id"] if "to_account_id" in changes else txn.to_account_id,
        category_id=changes["category_id"] if "category_id" in changes else txn.category_id,
    )
    unchanged = {i for i in (txn.account_id, txn.to_account_id, txn.category_id) if i is not None}
    validate_shape(db, user_id, shape, allow_archived=unchanged)
    for field, value in changes.items():
        setattr(txn, field, value)


def update_transaction(
    db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate
) -> Transaction:
    txn = get_transaction(db, user_id, txn_id)
    apply_changes(db, user_id, txn, data)
    db.commit()
    db.refresh(txn)
    return txn


def delete_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> None:
    db.delete(get_transaction(db, user_id, txn_id))
    db.commit()
