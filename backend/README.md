# Finanzas — backend

## Desarrollo local

```bash
docker compose up -d db          # desde la raíz del repo (Postgres en el puerto 5434)
cd backend
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run python -m app.cli invite tu@email.com   # imprime el enlace de registro
uv run uvicorn app.main:app --reload
```

- Tests: `uv run pytest`
- Lint y tipos: `uv run ruff check . && uv run ruff format --check . && uv run mypy app`
- Nueva migración: `uv run alembic revision --autogenerate -m "..."` (revisa el archivo generado)
- Evaluación del parser con la API real (gasta tokens): `uv run python -m evals.run_parser_eval`
- Reset de contraseña: `uv run python -m app.cli reset-password tu@email.com`

## Variables de entorno

| Variable | Descripción |
|---|---|
| `ENVIRONMENT` | `production` en Railway. En producción el backend se niega a arrancar si faltan `COOKIE_SECURE=true`, un `CRON_TOKEN` propio, `AI_PARSER=claude` y `ANTHROPIC_API_KEY` |
| `DATABASE_URL` | `postgresql+psycopg://...`. En Neon, cambia el prefijo `postgresql://` por `postgresql+psycopg://` y conserva `?sslmode=require` |
| `ALLOWED_ORIGIN` | Origen del frontend (p. ej. `https://finanzas.vercel.app`) |
| `COOKIE_SECURE` | `true` en producción |
| `CRON_TOKEN` | Secreto largo aleatorio; el mismo valor va en el secret `CRON_TOKEN` de GitHub |
| `INVITE_BASE_URL` | URL base de los enlaces de invitación; en producción `https://<frontend>/registro` |
| `AI_PARSER` | `claude` en producción, `fake` en local |
| `ANTHROPIC_API_KEY` | Solo en el backend |
| `CLAUDE_MODEL` / `CLAUDE_EFFORT` / `CLAUDE_FALLBACKS` | Por defecto `claude-opus-5-5` / `low` / `true` |

## Despliegue (Railway + Neon)

1. Crea el proyecto en Neon y copia la cadena de conexión (rama `main`).
2. En Railway, crea un servicio desde el repo con raíz `backend/` (usa el `Dockerfile`).
3. Configura las variables de la tabla. Las migraciones corren al arrancar el contenedor.
4. En GitHub, agrega los secrets `CRON_TOKEN` y `BACKEND_URL` (URL pública de Railway) para el workflow `recurring-job`.
5. Crea tu usuario: `railway run python -m app.cli invite tu@email.com`.
