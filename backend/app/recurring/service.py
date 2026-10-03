import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.auth.models import User
from app.core.clock import local_today
from app.core.db import get_owned
from app.core.errors import AppError
from app.recurring.models import RecurringTemplate
from app.recurring.schedule import due_dates, first_run_date, next_run_after
from app.recurring.schemas import RecurringCreate, RecurringUpdate
from app.transactions.models import Transaction
from app.transactions.validation import Shape, validate_shape

NON_NULLABLE = ("type", "amount", "account_id", "active")


def list_templates(db: Session, user_id: uuid.UUID) -> list[RecurringTemplate]:
    return list(
        db.scalars(
            select(RecurringTemplate)
            .where(RecurringTemplate.user_id == user_id)
            .order_by(RecurringTemplate.day_of_month, RecurringTemplate.created_at)
        )
    )


def create_template(db: Session, user_id: uuid.UUID, data: RecurringCreate) -> RecurringTemplate:
    validate_shape(
        db, user_id, Shape(data.type, data.account_id, data.to_account_id, data.category_id)
    )
    template = RecurringTemplate(
        user_id=user_id,
        next_run_date=first_run_date(data.start_date, data.day_of_month),
        **data.model_dump(),
    )
    db.add(template)
    db.commit()
    return template


def update_template(
    db: Session, user_id: uuid.UUID, template_id: uuid.UUID, data: RecurringUpdate, now: datetime
) -> RecurringTemplate:
    template = get_owned(db, RecurringTemplate, template_id, user_id, "RECURRING_NOT_FOUND")
    changes = data.model_dump(exclude_unset=True)
    for field in NON_NULLABLE:
        if field in changes and changes[field] is None:
            raise AppError(422, "FIELD_REQUIRED", f"{field} no puede ser nulo", {"field": field})
    shape = Shape(
        type=changes.get("type", template.type),
        account_id=changes.get("account_id", template.account_id),
        to_account_id=changes["to_account_id"]
        if "to_account_id" in changes
        else template.to_account_id,
        category_id=changes["category_id"] if "category_id" in changes else template.category_id,
    )
    unchanged = {
        i
        for i in (template.account_id, template.to_account_id, template.category_id)
        if i is not None
    }
    validate_shape(db, user_id, shape, allow_archived=unchanged)
    reactivating = changes.get("active") is True and not template.active
    for field, value in changes.items():
        setattr(template, field, value)
    if reactivating:
        user = db.get(User, user_id)
        today = local_today(now, user.timezone if user else "America/Bogota")
        if template.next_run_date < today:
            template.next_run_date = first_run_date(today, template.day_of_month)
    db.commit()
    return template


def delete_template(db: Session, user_id: uuid.UUID, template_id: uuid.UUID) -> None:
    db.delete(get_owned(db, RecurringTemplate, template_id, user_id, "RECURRING_NOT_FOUND"))
    db.commit()


def run_due_templates(db: Session, now: datetime) -> int:
    created = 0
    rows = db.execute(
        select(RecurringTemplate, User.timezone)
        .join(User, User.id == RecurringTemplate.user_id)
        .where(RecurringTemplate.active.is_(True))
    ).all()
    for template, timezone in rows:
        today = local_today(now, timezone)
        dates = due_dates(template.next_run_date, template.day_of_month, today, template.end_date)
        for day in dates:
            result = db.execute(
                pg_insert(Transaction)
                .values(
                    user_id=template.user_id,
                    type=template.type,
                    amount=template.amount,
                    date=day,
                    account_id=template.account_id,
                    to_account_id=template.to_account_id,
                    category_id=template.category_id,
                    description=template.description,
                    status="pending",
                    source="recurring",
                    recurring_template_id=template.id,
                )
                .on_conflict_do_nothing(constraint="uq_transactions_template_date")
                .returning(Transaction.id)
            )
            created += 1 if result.scalar_one_or_none() is not None else 0
        if dates:
            template.next_run_date = next_run_after(dates[-1], template.day_of_month)
        if template.end_date is not None and template.next_run_date > template.end_date:
            template.active = False
    db.commit()
    return created
