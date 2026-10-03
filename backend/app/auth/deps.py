from datetime import datetime

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.service import resolve_session
from app.core.clock import get_now
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError

SESSION_COOKIE = "session"


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def get_current_user(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = resolve_session(db, token, now) if token else None
    if user is None:
        raise AppError(401, "NOT_AUTHENTICATED", "Inicia sesión")
    assert token is not None
    set_session_cookie(response, token)
    return user
