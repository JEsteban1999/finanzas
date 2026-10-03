import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.accounts.models import Account
from app.categories.models import Category
from app.core.db import get_owned
from app.core.errors import AppError
from app.savings.models import SavingsRule
from app.savings.schemas import SavingsRuleIn, SavingsSuggestion
from app.transactions.models import Transaction


def suggest_amount(mode: str, value: int, income: int) -> int:
    if mode == "percent":
        return income * value // 100
    return min(value, income)


def get_rule(db: Session, user_id: uuid.UUID) -> SavingsRule | None:
    return db.scalar(select(SavingsRule).where(SavingsRule.user_id == user_id))


def upsert_rule(db: Session, user_id: uuid.UUID, data: SavingsRuleIn) -> SavingsRule:
    category = get_owned(db, Category, data.trigger_category_id, user_id, "CATEGORY_NOT_FOUND")
    if category.kind != "income":
        raise AppError(
            422, "SAVINGS_TRIGGER_NOT_INCOME", "La regla se dispara con una categoría de ingreso"
        )
    account = get_owned(db, Account, data.target_account_id, user_id, "ACCOUNT_NOT_FOUND")
    if account.type != "savings":
        raise AppError(
            422, "SAVINGS_TARGET_NOT_SAVINGS", "El destino debe ser una cuenta de ahorro"
        )
    rule = get_rule(db, user_id)
    if rule is None:
        rule = SavingsRule(user_id=user_id, **data.model_dump())
        db.add(rule)
    else:
        for field, value in data.model_dump().items():
            setattr(rule, field, value)
    db.commit()
    return rule


def delete_rule(db: Session, user_id: uuid.UUID) -> None:
    db.execute(delete(SavingsRule).where(SavingsRule.user_id == user_id))
    db.commit()


def savings_effect(db: Session, user_id: uuid.UUID, txn: Transaction) -> SavingsSuggestion | None:
    if txn.type != "income" or txn.status != "confirmed":
        return None
    rule = get_rule(db, user_id)
    if (
        rule is None
        or not rule.active
        or rule.trigger_category_id != txn.category_id
        or rule.target_account_id == txn.account_id
    ):
        return None
    target = db.get(Account, rule.target_account_id)
    if target is None or target.archived:
        return None
    amount = suggest_amount(rule.mode, rule.value, txn.amount)
    if amount <= 0:
        return None
    return SavingsSuggestion(
        amount=amount,
        from_account_id=txn.account_id,
        to_account_id=rule.target_account_id,
        date=txn.date,
    )
