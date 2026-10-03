import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.categories.models import Category
from app.categories.schemas import CategoryCreate, CategoryOut, CategoryUpdate
from app.categories.service import (
    create_category,
    delete_category,
    list_categories,
    update_category,
)
from app.core.clock import get_now
from app.core.db import get_db

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_(
    include_archived: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Category]:
    return list_categories(db, user.id, include_archived)


@router.post("", status_code=201, response_model=CategoryOut)
def create(
    body: CategoryCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Category:
    return create_category(db, user.id, body)


@router.patch("/{category_id}", response_model=CategoryOut)
def update(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> Category:
    return update_category(db, user.id, category_id, body, now)


@router.delete("/{category_id}", status_code=204)
def delete(
    category_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_category(db, user.id, category_id)
