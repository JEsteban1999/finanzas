import datetime as dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin

SHAPE_CHECK = (
    "(type = 'transfer' AND to_account_id IS NOT NULL AND category_id IS NULL"
    " AND to_account_id <> account_id)"
    " OR (type <> 'transfer' AND to_account_id IS NULL AND category_id IS NOT NULL)"
)


class Transaction(IdTimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("type IN ('income', 'expense', 'transfer')", name="type_valid"),
        CheckConstraint("status IN ('confirmed', 'pending')", name="status_valid"),
        CheckConstraint(
            "source IN ('manual', 'voice', 'recurring', 'savings_rule')", name="source_valid"
        ),
        CheckConstraint(SHAPE_CHECK, name="shape_valid"),
        Index("ix_transactions_user_date", "user_id", "date"),
        Index("ix_transactions_user_category_date", "user_id", "category_id", "date"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(BigInteger)
    date: Mapped[dt.date] = mapped_column(Date)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    description: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(10), default="confirmed")
    source: Mapped[str] = mapped_column(String(15), default="manual")
