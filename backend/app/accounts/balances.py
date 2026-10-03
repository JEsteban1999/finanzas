import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account


def compute_balances(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = db.execute(select(Account.id, Account.initial_balance).where(Account.user_id == user_id))
    return {account_id: int(balance) for account_id, balance in rows}
