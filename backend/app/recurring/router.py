import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.models import User
from app.core.clock import get_now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError
from app.recurring.models import RecurringTemplate
from app.recurring.schemas import RecurringCreate, RecurringOut, RecurringUpdate
from app.recurring.service import (
    create_template,
    delete_template,
    list_templates,
    run_due_templates,
    update_template,
)

router = APIRouter(prefix="/api/recurring", tags=["recurring"])
internal_router = APIRouter(prefix="/internal/jobs", tags=["internal"])


@router.get("", response_model=list[RecurringOut])
def list_(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[RecurringTemplate]:
    return list_templates(db, user.id)


@router.post("", status_code=201, response_model=RecurringOut)
def create(
    body: RecurringCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> RecurringTemplate:
    return create_template(db, user.id, body)


@router.patch("/{template_id}", response_model=RecurringOut)
def update(
    template_id: uuid.UUID,
    body: RecurringUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> RecurringTemplate:
    return update_template(db, user.id, template_id, body, now)


@router.delete("/{template_id}", status_code=204)
def delete(
    template_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    delete_template(db, user.id, template_id)


def _valid_cron_token(header: str | None) -> bool:
    if header is None:
        return False
    expected = f"Bearer {get_settings().cron_token}"
    return secrets.compare_digest(header.encode(), expected.encode())


@internal_router.post("/recurring")
def run_recurring(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> dict[str, int]:
    if not _valid_cron_token(authorization):
        raise AppError(401, "INVALID_CRON_TOKEN", "Token inválido")
    return {"created": run_due_templates(db, now)}
