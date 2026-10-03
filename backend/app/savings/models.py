import uuid

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class SavingsRule(IdTimestampMixin, Base):
    __tablename__ = "savings_rules"
    __table_args__ = (
        CheckConstraint("mode IN ('percent', 'fixed')", name="mode_valid"),
        CheckConstraint("value > 0", name="value_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    mode: Mapped[str] = mapped_column(String(10))
    value: Mapped[int] = mapped_column(BigInteger)
    trigger_category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT")
    )
    target_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
