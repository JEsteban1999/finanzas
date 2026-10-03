import datetime as dt
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.budgets.service import budget_effect
from app.core.db import get_db
from app.savings.service import savings_effect
from app.transactions.models import Transaction
from app.transactions.schemas import (
    TransactionCreate,
    TransactionOut,
    TransactionPage,
    TransactionSaved,
    TransactionStatus,
    TransactionType,
    TransactionUpdate,
)
from app.transactions.service import (
    TransactionFilters,
    create_transaction,
    delete_transaction,
    get_transaction,
    list_transactions,
    update_transaction,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _saved(db: Session, user_id: uuid.UUID, txn: Transaction) -> TransactionSaved:
    return TransactionSaved(
        transaction=TransactionOut.model_validate(txn),
        budget_status=budget_effect(db, user_id, txn),
        savings_suggestion=savings_effect(db, user_id, txn),
    )


@router.post("", status_code=201, response_model=TransactionSaved)
def create(
    body: TransactionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TransactionSaved:
    return _saved(db, user.id, create_transaction(db, user.id, body))


@router.get("", response_model=TransactionPage)
def list_(
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
    type: TransactionType | None = None,
    category_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    status: TransactionStatus | None = None,
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionPage:
    filters = TransactionFilters(
        date_from, date_to, type, category_id, account_id, status, q, limit, cursor
    )
    items, next_cursor = list_transactions(db, user.id, filters)
    return TransactionPage(
        items=[TransactionOut.model_validate(t) for t in items], next_cursor=next_cursor
    )


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
