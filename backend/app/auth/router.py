import time
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.auth.deps import SESSION_COOKIE, get_current_user, set_session_cookie
from app.auth.models import User
from app.auth.schemas import LoginIn, RegisterIn, UserOut
from app.auth.service import (
    authenticate,
    create_session,
    normalize_email,
    register_with_invitation,
    revoke_session,
)
from app.core.clock import get_now
from app.core.db import get_db
from app.core.errors import AppError

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201, response_model=UserOut)
def register(
    body: RegisterIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> User:
    user = register_with_invitation(db, body.token, body.password, body.display_name, now)
    token = create_session(db, user, now, request.headers.get("user-agent"))
    set_session_cookie(response, token)
    return user


@router.post("/login", response_model=UserOut)
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> User:
    host = request.client.host if request.client else "unknown"
    email = normalize_email(body.email)
    moment = time.monotonic()
    # Ambos buckets se consumen siempre; el de email no depende de la IP (X-Forwarded-For).
    ip_ok = request.app.state.login_limiter.hit(f"{host}|{email}", moment)
    email_ok = request.app.state.login_email_limiter.hit(email, moment)
    if not (ip_ok and email_ok):
        raise AppError(429, "LOGIN_RATE_LIMITED", "Demasiados intentos, espera un minuto")
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos")
    token = create_session(db, user, now, request.headers.get("user-agent"))
    set_session_cookie(response, token)
    return user


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(db, token, now)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
