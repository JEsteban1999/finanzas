import argparse
import sys

from sqlalchemy.orm import Session

from app.auth.service import create_invitation, reset_password
from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    invite = sub.add_parser("invite", help="Crea una invitación y muestra el enlace")
    invite.add_argument("email")
    reset = sub.add_parser("reset-password", help="Asigna una contraseña temporal")
    reset.add_argument("email")
    return parser


def main(argv: list[str] | None = None, db: Session | None = None) -> int:
    args = _parser().parse_args(argv)
    owns_session = db is None
    session = db if db is not None else SessionLocal()
    try:
        if args.command == "invite":
            token = create_invitation(session, args.email, utcnow())
            print(f"{get_settings().invite_base_url}?token={token}")
        else:
            temporary = reset_password(session, args.email, utcnow())
            print(f"Contraseña temporal para {args.email}: {temporary}")
        return 0
    except AppError as exc:
        print(exc.message, file=sys.stderr)
        return 1
    finally:
        if owns_session:
            session.close()


if __name__ == "__main__":
    raise SystemExit(main())
