from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.auth.models import Invitation, UserSession
from app.auth.service import create_invitation, create_user
from app.cli import main
from app.core.errors import AppError
from app.core.security import hash_token, verify_password

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)


def test_create_user_normalizes_email(db):
    user = create_user(db, "  Ana@Example.COM ", "clave-segura-123", "Ana")
    assert user.email == "ana@example.com"
    assert user.timezone == "America/Bogota"
    assert user.is_active


def test_create_user_duplicate_email(db):
    create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    with pytest.raises(AppError) as exc:
        create_user(db, "ANA@example.com", "clave-segura-456", "Ana 2")
    assert exc.value.status_code == 409
    assert exc.value.code == "EMAIL_TAKEN"


def test_create_invitation_stores_only_hash(db):
    token = create_invitation(db, "Nueva@Example.com", NOW)
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    assert inv is not None
    assert inv.email == "nueva@example.com"
    assert inv.used_at is None
    assert (inv.expires_at - NOW).days == 7


def test_cli_invite_prints_link(db, capsys):
    assert main(["invite", "Nueva@Example.com"], db=db) == 0
    out = capsys.readouterr().out.strip()
    assert out.startswith("http://localhost:3000/registro?token=")
    token = out.split("token=")[1]
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(token)))
    assert inv is not None and inv.email == "nueva@example.com"


def test_cli_reset_password_sets_temp_password_and_revokes_sessions(db, capsys):
    user = create_user(db, "ana@example.com", "clave-segura-123", "Ana")
    db.add(UserSession(user_id=user.id, token_hash="x" * 64, expires_at=NOW))
    db.commit()
    assert main(["reset-password", "ana@example.com"], db=db) == 0
    temp = capsys.readouterr().out.strip().split(": ")[-1]
    db.refresh(user)
    assert len(temp) >= 10
    assert verify_password(user.password_hash, temp)
    session = db.scalar(select(UserSession).where(UserSession.user_id == user.id))
    assert session is not None and session.revoked_at is not None


def test_cli_reset_password_unknown_user(db, capsys):
    assert main(["reset-password", "nadie@example.com"], db=db) == 1
    assert "Usuario no encontrado" in capsys.readouterr().err
