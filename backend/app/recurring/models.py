import datetime as dt
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin
from app.transactions.models import SHAPE_CHECK


class RecurringTemplate(IdTimestampMixin, Base):
    __tablename__ = "recurring_templates"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("type IN ('income', 'expense', 'transfer')", name="type_valid"),
        CheckConstraint("day_of_month BETWEEN 1 AND 31", name="day_valid"),
        CheckConstraint(SHAPE_CHECK, name="shape_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int] = mapped_column(BigInteger)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    description: Mapped[str | None] = mapped_column(String(200))
    day_of_month: Mapped[int] = mapped_column(SmallInteger)
    start_date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    next_run_date: Mapped[dt.date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
