import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.accounts.balances import compute_balances
from app.accounts.models import Account
from app.accounts.schemas import AccountCreate, AccountOut, AccountUpdate
from app.accounts.service import create_account, delete_account, list_accounts, update_account
from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.db import get_db

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _out(account: Account, balances: dict[uuid.UUID, int]) -> AccountOut:
    return AccountOut(
        id=account.id,
        name=account.name,
        type=account.type,  # type: ignore[arg-type]
        initial_balance=account.initial_balance,
        archived=account.archived,
        balance=balances.get(account.id, account.initial_balance),
    )


@router.get("", response_model=list[AccountOut])
def list_(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AccountOut]:
    balances = compute_balances(db, user.id)
    return [_out(a, balances) for a in list_accounts(db, user.id, include_archived)]


@router.post("", status_code=201, response_model=AccountOut)
def create(
    body: AccountCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AccountOut:
    account = create_account(db, user.id, body)
    return _out(account, compute_balances(db, user.id))


@router.patch("/{account_id}", response_model=AccountOut)
def update(
    account_id: uuid.UUID,
    body: AccountUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> AccountOut:
    account = update_account(db, user.id, account_id, body, now)
    return _out(account, compute_balances(db, user.id))


@router.delete("/{account_id}", status_code=204)
def delete(
    account_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_account(db, user.id, account_id)
