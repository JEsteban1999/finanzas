import datetime as dt
import uuid

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class Budget(IdTimestampMixin, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "category_id", "valid_from", name="uq_budgets_user_category_month"
        ),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
        CheckConstraint("EXTRACT(DAY FROM valid_from) = 1", name="valid_from_first_day"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(BigInteger)
    valid_from: Mapped[dt.date] = mapped_column(Date)
