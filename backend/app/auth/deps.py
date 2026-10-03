from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.service import resolve_session
from app.core.clock import get_now
from app.core.db import get_db
from app.core.errors import AppError

SESSION_COOKIE = "session"


def get_current_user(
    request: Request, db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = resolve_session(db, token, now) if token else None
    if user is None:
        raise AppError(401, "NOT_AUTHENTICATED", "Inicia sesión")
    return user
