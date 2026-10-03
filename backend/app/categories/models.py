import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdTimestampMixin


class Category(IdTimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", "kind", name="uq_categories_user_name_kind"),
        CheckConstraint("kind IN ('income', 'expense')", name="kind_valid"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def archived(self) -> bool:
        return self.archived_at is not None
