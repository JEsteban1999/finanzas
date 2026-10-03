import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.db import get_db
from app.transactions.models import Transaction
from app.transactions.schemas import (
    TransactionCreate,
    TransactionOut,
    TransactionSaved,
    TransactionUpdate,
)
from app.transactions.service import (
    create_transaction,
    delete_transaction,
    get_transaction,
    update_transaction,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _saved(db: Session, user_id: uuid.UUID, txn: Transaction) -> TransactionSaved:
    return TransactionSaved(transaction=TransactionOut.model_validate(txn))


@router.post("", status_code=201, response_model=TransactionSaved)
def create(
    body: TransactionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TransactionSaved:
    return _saved(db, user.id, create_transaction(db, user.id, body))


@router.get("/{transaction_id}", response_model=TransactionOut)
def get(
    transaction_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    return get_transaction(db, user.id, transaction_id)


@router.patch("/{transaction_id}", response_model=TransactionOut)
def update(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Transaction:
    return update_transaction(db, user.id, transaction_id, body)


@router.delete("/{transaction_id}", status_code=204)
def delete(
    transaction_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    delete_transaction(db, user.id, transaction_id)
