"""Recrea la BD de Playwright, aplica migraciones y crea el usuario de pruebas."""

import os
import subprocess
import sys

from sqlalchemy import create_engine, text

ADMIN_URL = os.environ.get(
    "E2E_ADMIN_URL", "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas"
)
E2E_URL = os.environ.get(
    "E2E_DATABASE_URL", "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas_e2e"
)


def main() -> None:
    engine = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text("DROP DATABASE IF EXISTS finanzas_e2e WITH (FORCE)"))
        conn.execute(text("CREATE DATABASE finanzas_e2e"))
    engine.dispose()
    env = {**os.environ, "DATABASE_URL": E2E_URL}
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, env=env)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "app.cli",
            "create-user",
            "e2e@example.com",
            "--password",
            "clave-segura-e2e",
            "--name",
            "E2E",
        ],
        check=True,
        env=env,
    )


if __name__ == "__main__":
    main()
