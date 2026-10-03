from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.models import Invitation, User, UserSession
from app.core.errors import AppError
from app.core.security import hash_password, hash_token, new_token


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_user(db: Session, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(409, "EMAIL_TAKEN", "Ya existe un usuario con ese email")
    user = User(email=email, password_hash=hash_password(password), display_name=display_name)
    db.add(user)
    db.flush()
    db.commit()
    return user


def create_invitation(db: Session, email: str, now: datetime, valid_days: int = 7) -> str:
    token = new_token()
    db.add(
        Invitation(
            email=normalize_email(email),
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=valid_days),
        )
    )
    db.commit()
    return token


def reset_password(db: Session, email: str, now: datetime) -> str:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        raise AppError(404, "USER_NOT_FOUND", "Usuario no encontrado")
    temporary = new_token()[:16]
    user.password_hash = hash_password(temporary)
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
    return temporary
