import uuid

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.transactions.models import Transaction


def compute_balances(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    t, a = Transaction, Account
    signed = case(
        ((t.type == "income") & (t.account_id == a.id), t.amount),
        ((t.type == "expense") & (t.account_id == a.id), -t.amount),
        ((t.type == "transfer") & (t.account_id == a.id), -t.amount),
        ((t.type == "transfer") & (t.to_account_id == a.id), t.amount),
        else_=0,
    )
    stmt = (
        select(a.id, a.initial_balance + func.coalesce(func.sum(signed), 0))
        .select_from(a)
        .outerjoin(
            t,
            (t.status == "confirmed") & or_(t.account_id == a.id, t.to_account_id == a.id),
        )
        .where(a.user_id == user_id)
        .group_by(a.id, a.initial_balance)
    )
    return {account_id: int(balance) for account_id, balance in db.execute(stmt)}
