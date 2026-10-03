import base64
import datetime as dt
import json
import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_owned
from app.core.errors import AppError
from app.transactions.models import Transaction
from app.transactions.schemas import TransactionCreate, TransactionUpdate
from app.transactions.validation import Shape, validate_shape

NON_NULLABLE = ("type", "amount", "date", "account_id")


def create_transaction(db: Session, user_id: uuid.UUID, data: TransactionCreate) -> Transaction:
    validate_shape(
        db, user_id, Shape(data.type, data.account_id, data.to_account_id, data.category_id)
    )
    txn = Transaction(user_id=user_id, status="confirmed", **data.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


def get_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> Transaction:
    return get_owned(db, Transaction, txn_id, user_id, "TRANSACTION_NOT_FOUND")


def apply_changes(
    db: Session, user_id: uuid.UUID, txn: Transaction, data: TransactionUpdate
) -> None:
    changes = data.model_dump(exclude_unset=True)
    for field in NON_NULLABLE:
        if field in changes and changes[field] is None:
            raise AppError(422, "FIELD_REQUIRED", f"{field} no puede ser nulo", {"field": field})
    shape = Shape(
        type=changes.get("type", txn.type),
        account_id=changes.get("account_id", txn.account_id),
        to_account_id=changes["to_account_id"] if "to_account_id" in changes else txn.to_account_id,
        category_id=changes["category_id"] if "category_id" in changes else txn.category_id,
    )
    unchanged = {i for i in (txn.account_id, txn.to_account_id, txn.category_id) if i is not None}
    validate_shape(db, user_id, shape, allow_archived=unchanged)
    for field, value in changes.items():
        setattr(txn, field, value)


def _commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409, "DUPLICATE_OCCURRENCE", "Ya existe ese movimiento recurrente en esa fecha"
        ) from exc


def update_transaction(
    db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate
) -> Transaction:
    txn = get_transaction(db, user_id, txn_id)
    apply_changes(db, user_id, txn, data)
    _commit_or_conflict(db)
    db.refresh(txn)
    return txn


def confirm_transaction(
    db: Session, user_id: uuid.UUID, txn_id: uuid.UUID, data: TransactionUpdate
) -> Transaction:
    txn = get_transaction(db, user_id, txn_id)
    if txn.status != "pending":
        raise AppError(409, "TRANSACTION_NOT_PENDING", "Este movimiento ya está confirmado")
    apply_changes(db, user_id, txn, data)
    txn.status = "confirmed"
    _commit_or_conflict(db)
    db.refresh(txn)
    return txn


def delete_transaction(db: Session, user_id: uuid.UUID, txn_id: uuid.UUID) -> None:
    db.delete(get_transaction(db, user_id, txn_id))
    db.commit()


@dataclass(frozen=True)
class TransactionFilters:
    date_from: dt.date | None = None
    date_to: dt.date | None = None
    type: str | None = None
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    status: str | None = None
    q: str | None = None
    limit: int = 50
    cursor: str | None = None


def _encode_cursor(txn: Transaction) -> str:
    raw = json.dumps([txn.date.isoformat(), txn.created_at.isoformat(), str(txn.id)])
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[dt.date, dt.datetime, uuid.UUID]:
    try:
        d, c, i = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        return dt.date.fromisoformat(d), dt.datetime.fromisoformat(c), uuid.UUID(i)
    except (ValueError, TypeError) as exc:
        raise AppError(422, "INVALID_CURSOR", "Cursor inválido") from exc


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_transactions(
    db: Session, user_id: uuid.UUID, f: TransactionFilters
) -> tuple[list[Transaction], str | None]:
    t = Transaction
    stmt = select(t).where(t.user_id == user_id)
    if f.date_from:
        stmt = stmt.where(t.date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(t.date <= f.date_to)
    if f.type:
        stmt = stmt.where(t.type == f.type)
    if f.category_id:
        stmt = stmt.where(t.category_id == f.category_id)
    if f.account_id:
        stmt = stmt.where(or_(t.account_id == f.account_id, t.to_account_id == f.account_id))
    if f.status:
        stmt = stmt.where(t.status == f.status)
    if f.q:
        stmt = stmt.where(t.description.ilike(f"%{_escape_like(f.q)}%", escape="\\"))
    if f.cursor:
        d, c, i = _decode_cursor(f.cursor)
        stmt = stmt.where(tuple_(t.date, t.created_at, t.id) < tuple_(d, c, i))
    stmt = stmt.order_by(t.date.desc(), t.created_at.desc(), t.id.desc()).limit(f.limit + 1)
    rows = list(db.scalars(stmt))
    next_cursor = _encode_cursor(rows[f.limit - 1]) if len(rows) > f.limit else None
    return rows[: f.limit], next_cursor
