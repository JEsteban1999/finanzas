# Finanzas personales — frontend

Next.js 16 (PWA móvil) que consume el backend FastAPI a través de un proxy `/api/*` (rewrites de Next), de modo que el navegador solo habla con el mismo origen y las cookies de sesión funcionan.

## Desarrollo

Requisitos: Node 24, backend corriendo (ver `../backend`).

```bash
npm ci
BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:3000
npm test            # Vitest
npm run lint
npm run typecheck
npm run gen:api     # regenera src/lib/api/schema.d.ts desde el OpenAPI del backend (usa uv o `python -m uv`)
npm run e2e         # Playwright
```

Prerrequisitos de `npm run e2e`: Postgres de desarrollo arriba (`docker compose up -d db` en la raíz, puerto 5434), dependencias del backend instaladas (`uv sync`) y `npx playwright install chromium`. Playwright levanta solo el backend (puerto 8010) y el frontend (puerto 3100). En CI se define `UV_CMD=uv`.

## Variables de entorno

| Variable | Dónde | Descripción |
| --- | --- | --- |
| `BACKEND_URL` | frontend | URL del backend a la que Next reenvía `/api/*`. En desarrollo por defecto `http://localhost:8000`. **Obligatoria en producción**: `next build` falla si falta. |
| `ALLOWED_ORIGIN` | backend | Origen del frontend permitido por el backend. Debe coincidir con el dominio desde el que se sirve este frontend; si no, el backend responde 403 `ORIGIN_NOT_ALLOWED`. |

`BACKEND_URL` (frontend) y `ALLOWED_ORIGIN` (backend) van emparejadas: cada despliegue del frontend apunta a un backend cuyo `ALLOWED_ORIGIN` es el dominio de ese frontend.

## Build

`next build` usa `NODE_ENV=production`, por lo que requiere `BACKEND_URL`:

```bash
BACKEND_URL=http://localhost:8000 npm run build
```

## Despliegue en Vercel

- Define `BACKEND_URL` en las variables de entorno del proyecto (URL pública del backend).
- En el backend, `ALLOWED_ORIGIN` debe ser el dominio de producción del frontend.
- Limitación: los previews de pull request tienen un dominio distinto, así que el backend responde 403 `ORIGIN_NOT_ALLOWED` a sus peticiones, salvo que el preview apunte a un backend cuyo `ALLOWED_ORIGIN` coincida con el dominio del preview.
