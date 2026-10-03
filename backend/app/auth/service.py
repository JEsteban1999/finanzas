from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.models import Invitation, User, UserSession
from app.categories.service import seed_default_categories
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import DUMMY_HASH, hash_password, hash_token, new_token, verify_password


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_user(db: Session, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError(409, "EMAIL_TAKEN", "Ya existe un usuario con ese email")
    user = User(email=email, password_hash=hash_password(password), display_name=display_name)
    db.add(user)
    db.flush()
    seed_default_categories(db, user.id)
    db.commit()
    return user


def change_password(
    db: Session, user: User, current: str, new: str, keep_token: str, now: datetime
) -> None:
    if not verify_password(user.password_hash, current):
        raise AppError(400, "WRONG_PASSWORD", "La contraseña actual no es correcta")
    user.password_hash = hash_password(new)
    db.execute(
        update(UserSession)
        .where(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
            UserSession.token_hash != hash_token(keep_token),
        )
        .values(revoked_at=now)
    )
    db.commit()


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


def register_with_invitation(
    db: Session, token: str, password: str, display_name: str, now: datetime
) -> User:
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    if invitation is None or invitation.used_at is not None or invitation.expires_at <= now:
        raise AppError(400, "INVALID_INVITATION", "La invitación no es válida o expiró")
    invitation.used_at = now
    return create_user(db, invitation.email, password, display_name)


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        verify_password(DUMMY_HASH, password)
        return None
    if not user.is_active or not verify_password(user.password_hash, password):
        return None
    return user


def create_session(db: Session, user: User, now: datetime, user_agent: str | None) -> str:
    token = new_token()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=now + timedelta(days=get_settings().session_days),
            user_agent=(user_agent or "")[:300] or None,
        )
    )
    db.commit()
    return token


def resolve_session(db: Session, token: str, now: datetime) -> User | None:
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        return None
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        return None
    renewed = now + timedelta(days=get_settings().session_days)
    if renewed - session.expires_at > timedelta(days=1):
        session.expires_at = renewed
        db.commit()
    return user


def revoke_session(db: Session, token: str, now: datetime) -> None:
    db.execute(
        update(UserSession)
        .where(UserSession.token_hash == hash_token(token), UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()
