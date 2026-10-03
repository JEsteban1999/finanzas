import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.categories.models import Category
from app.categories.schemas import CategoryCreate, CategoryUpdate
from app.core.db import get_owned
from app.core.errors import AppError

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Salario", "income"),
    ("Ingreso extra", "income"),
    ("Comida", "expense"),
    ("Transporte", "expense"),
    ("Vivienda", "expense"),
    ("Servicios", "expense"),
    ("Suscripciones", "expense"),
    ("Salud", "expense"),
    ("Ocio", "expense"),
    ("Otros", "expense"),
]

NAME_TAKEN = AppError(409, "CATEGORY_NAME_TAKEN", "Ya tienes una categoría con ese nombre")


def seed_default_categories(db: Session, user_id: uuid.UUID) -> None:
    for name, kind in DEFAULT_CATEGORIES:
        db.add(Category(user_id=user_id, name=name, kind=kind))
    db.flush()


def list_categories(db: Session, user_id: uuid.UUID, include_archived: bool) -> list[Category]:
    stmt = select(Category).where(Category.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list(db.scalars(stmt.order_by(Category.kind, Category.name)))


def _ensure_name_free(
    db: Session, user_id: uuid.UUID, name: str, kind: str, exclude_id: uuid.UUID | None = None
) -> None:
    stmt = select(Category.id).where(
        Category.user_id == user_id,
        Category.kind == kind,
        func.lower(Category.name) == name.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise NAME_TAKEN


def create_category(db: Session, user_id: uuid.UUID, data: CategoryCreate) -> Category:
    _ensure_name_free(db, user_id, data.name, data.kind)
    category = Category(user_id=user_id, name=data.name, kind=data.kind)
    db.add(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise NAME_TAKEN from exc
    return category


def update_category(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID, data: CategoryUpdate, now: datetime
) -> Category:
    category = get_owned(db, Category, category_id, user_id, "CATEGORY_NOT_FOUND")
    if data.name is not None:
        _ensure_name_free(db, user_id, data.name, category.kind, exclude_id=category.id)
        category.name = data.name
    if data.archived is not None:
        category.archived_at = now if data.archived else None
    db.commit()
    return category


def delete_category(db: Session, user_id: uuid.UUID, category_id: uuid.UUID) -> None:
    category = get_owned(db, Category, category_id, user_id, "CATEGORY_NOT_FOUND")
    db.delete(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(
            409,
            "CATEGORY_IN_USE",
            "La categoría está en uso (movimientos, recurrentes o regla de ahorro); archívala en su lugar",
        ) from exc
