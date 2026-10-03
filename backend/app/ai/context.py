import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.auth.models import User
from app.categories.models import Category
from app.core.clock import local_today


@dataclass(frozen=True)
class CategoryRef:
    id: uuid.UUID
    name: str
    kind: str


@dataclass(frozen=True)
class AccountRef:
    id: uuid.UUID
    name: str
    type: str


@dataclass(frozen=True)
class ParseContext:
    today: date
    categories: list[CategoryRef]
    accounts: list[AccountRef]


def build_context(db: Session, user: User, now: datetime) -> ParseContext:
    categories = db.scalars(
        select(Category)
        .where(Category.user_id == user.id, Category.archived_at.is_(None))
        .order_by(Category.name)
    )
    accounts = db.scalars(
        select(Account)
        .where(Account.user_id == user.id, Account.archived_at.is_(None))
        .order_by(Account.name)
    )
    return ParseContext(
        today=local_today(now, user.timezone),
        categories=[CategoryRef(c.id, c.name, c.kind) for c in categories],
        accounts=[AccountRef(a.id, a.name, a.type) for a in accounts],
    )
