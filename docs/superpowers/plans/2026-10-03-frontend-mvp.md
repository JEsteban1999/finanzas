# Frontend MVP (Next.js) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la PWA mobile-first en Next.js que consume la API FastAPI del MVP (registro manual y por voz/texto, movimientos, dashboard, presupuestos, cuentas, categorías, recurrentes y "págate primero"), más los cuatro ajustes de backend que el frontend necesita.

**Architecture:** Next.js (App Router) con componentes de cliente; todas las llamadas van a `/api/*`, que `next.config.ts` reescribe hacia FastAPI (mismo origen → cookie `httpOnly` sin CORS). Tipos generados desde el OpenAPI del backend y cliente `openapi-fetch`; datos con TanStack Query. Código por funcionalidad en `src/features/<dominio>/` (`api.ts` con hooks + componentes). Estilos **mínimos y funcionales** con Tailwind: la capa visual se hará después con impeccable, así que aquí solo hay HTML semántico, labels accesibles y utilidades de espaciado básicas.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, TanStack Query 5, openapi-fetch 0.17 + openapi-typescript 7, Vitest 5 + Testing Library + jsdom, Playwright 1.63. Backend existente: FastAPI + Postgres (puerto 5434).

**Spec:** `docs/superpowers/specs/2026-10-03-finanzas-personales-design.md`

## Global Constraints

- Dinero: enteros en pesos COP; se muestra como `$1.250.000` (punto de miles, sin decimales, negativo `-$50.000`). Nunca `float` para montos.
- "Hoy" y "este mes" se calculan en `America/Bogota`.
- La API key de Anthropic nunca llega al frontend; el frontend solo llama a `/api/*`.
- El frontend nunca descarta lo que el usuario escribió en un formulario ante un error.
- Errores de la API: `{"error": {"code", "message", "details"}}`; el frontend muestra un mensaje en español por código.
- Formularios: cada campo tiene `<label>` asociado (los tests usan `getByLabelText`).
- Sin estilos de marca: nada de paletas, fuentes ni animaciones; solo layout funcional (impeccable se encarga después).
- Sin modo offline en v1.
- Los comandos de Python se ejecutan como `python -m uv ...` desde `backend/`; los de Node, desde `frontend/`.
- Postgres local: `docker compose up -d db` (puerto 5434).
- TDD: test que falla → implementación → test que pasa → commit.

## Review Focus

1. Un 401 en cualquier consulta (sesión vencida) debe llevar a `/login` sin dejar la pantalla en blanco ni en bucle — test en Task 6.
2. Si la IA falla (503) o se excede el límite (429), el texto escrito se conserva y el usuario puede seguir a mano — test en Task 10.
3. Montos escritos como `35.000`, `$ 35.000` o `35000` deben guardarse como `35000`; `35,5` no debe convertirse en 355 sin avisar — test en Task 5.
4. Cerca de la medianoche, "hoy" en el formulario debe ser la fecha de Bogotá aunque el dispositivo esté en otra zona — test en Task 5.
5. Un error del servidor al guardar (p. ej. 422 `ACCOUNT_ARCHIVED`) muestra el mensaje y conserva todos los valores del formulario — test en Task 9.

---

## Estructura de archivos

```
backend/ (ajustes)
  app/auth/{schemas,service,router}.py      # change-password
  app/cli.py                                # create-user
  app/core/config.py, app/main.py           # guard de producción
  app/recurring/{router,service}.py         # límite de start_date
  scripts/prepare_e2e_db.py                 # BD para Playwright
frontend/
  package.json, next.config.ts, vitest.config.mts, vitest.setup.ts, playwright.config.ts, .env.example
  scripts/gen-api.mjs
  src/app/layout.tsx, providers.tsx, manifest.ts, globals.css
  src/app/(auth)/login/page.tsx, (auth)/registro/page.tsx
  src/app/(app)/layout.tsx, page.tsx (Inicio), registrar/, movimientos/, presupuestos/, comparar/,
      mas/page.tsx, mas/{cuentas,categorias,recurrentes,ahorro,cuenta}/page.tsx
  src/lib/api/{schema.d.ts (generado), client.ts, errors.ts}
  src/lib/{money.ts, dates.ts, last-account.ts}
  src/components/{AppShell.tsx, MonthPicker.tsx, FormError.tsx}
  src/features/auth/{api.ts, LoginForm.tsx, RegisterForm.tsx, ChangePasswordForm.tsx}
  src/features/accounts/{api.ts, AccountsManager.tsx}
  src/features/categories/{api.ts, CategoriesManager.tsx}
  src/features/transactions/{api.ts, TransactionForm.tsx, SaveFeedback.tsx, TransactionList.tsx, PendingList.tsx}
  src/features/quick-entry/{speech.ts, QuickEntry.tsx}
  src/features/dashboard/{api.ts, MonthlySummary.tsx, CompareView.tsx}
  src/features/budgets/{api.ts, BudgetsPanel.tsx}
  src/features/recurring/{api.ts, RecurringManager.tsx}
  src/features/savings/{api.ts, SavingsRuleForm.tsx}
  src/test/{render.tsx, fetch-mock.ts}
  e2e/*.spec.ts
.github/workflows/frontend-ci.yml
```

---

### Task 1: Backend — cambio de contraseña, `create-user` en CLI y mensajes de "en uso"

**Files:**
- Modify: `backend/app/auth/schemas.py`, `backend/app/auth/service.py`, `backend/app/auth/router.py`
- Modify: `backend/app/cli.py`
- Modify: `backend/app/categories/service.py`, `backend/app/accounts/service.py`
- Test: `backend/tests/test_auth_api.py`, `backend/tests/test_auth_service.py`

**Interfaces:**
- Consumes: `get_current_user`, `SESSION_COOKIE`, `verify_password`, `hash_password`, `hash_token`, `UserSession`, `create_user`.
- Produces:
  - `POST /api/auth/change-password` body `{current_password, new_password}` (nueva ≥ 10) → `204`; `400 WRONG_PASSWORD` si la actual no coincide; revoca las demás sesiones del usuario y conserva la actual.
  - `change_password(db, user, current, new, keep_token, now) -> None` en `app/auth/service.py`.
  - CLI: `python -m app.cli create-user <email> --password <p> --name <n>` (imprime `Usuario creado: <email>`; código 1 y mensaje si el email existe).
  - Mensajes 409: `CATEGORY_IN_USE` → "La categoría está en uso (movimientos, recurrentes o regla de ahorro); archívala en su lugar"; `ACCOUNT_IN_USE` → "La cuenta está en uso (movimientos, recurrentes o regla de ahorro); archívala en su lugar".

- [ ] **Step 1: Tests que fallan**

Agrega a `backend/tests/test_auth_api.py`:
```python
def test_change_password(client_a, app, db):
    other = TestClient(app, headers={"Origin": "http://localhost:3000"})
    assert other.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "clave-segura-123"}
    ).status_code == 200
    response = client_a.post(
        "/api/auth/change-password",
        json={"current_password": "clave-segura-123", "new_password": "nueva-clave-456"},
    )
    assert response.status_code == 204
    assert client_a.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    fresh = TestClient(app, headers={"Origin": "http://localhost:3000"})
    ok = fresh.post("/api/auth/login", json={"email": "ana@example.com", "password": "nueva-clave-456"})
    assert ok.status_code == 200


def test_change_password_wrong_current(client_a):
    response = client_a.post(
        "/api/auth/change-password",
        json={"current_password": "incorrecta-000", "new_password": "nueva-clave-456"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "WRONG_PASSWORD"


def test_change_password_short_new(client_a):
    response = client_a.post(
        "/api/auth/change-password",
        json={"current_password": "clave-segura-123", "new_password": "corta"},
    )
    assert response.status_code == 422


def test_change_password_requires_session(client):
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "x" * 10, "new_password": "y" * 10},
    )
    assert response.status_code == 401
```
(Si `TestClient` no está importado en ese archivo, impórtalo de `fastapi.testclient`.)

Agrega a `backend/tests/test_auth_service.py`:
```python
def test_cli_create_user(db, capsys):
    assert main(["create-user", "E2E@Example.com", "--password", "clave-segura-123", "--name", "E2E"], db=db) == 0
    assert "Usuario creado: e2e@example.com" in capsys.readouterr().out
    assert main(["create-user", "e2e@example.com", "--password", "clave-segura-123", "--name", "E2E"], db=db) == 1
    assert "Ya existe" in capsys.readouterr().err
```

Agrega a `backend/tests/test_transactions_list.py`:
```python
def test_in_use_messages_mention_all_references(client_a, data):
    body = client_a.delete(f"/api/categories/{data['comida']}").json()
    assert "en uso" in body["error"]["message"]
    body = client_a.delete(f"/api/accounts/{data['savings']}").json()
    assert "en uso" in body["error"]["message"]
```

- [ ] **Step 2: Ver que fallan**

Run: `python -m uv run pytest tests/test_auth_api.py tests/test_auth_service.py tests/test_transactions_list.py -q`
Expected: FAIL (404 en `/api/auth/change-password`, `create-user` desconocido, mensaje viejo).

- [ ] **Step 3: Implementación**

`backend/app/auth/schemas.py`, agrega:
```python
class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)
```

`backend/app/auth/service.py`, agrega:
```python
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
```

`backend/app/auth/router.py`, agrega (importa `ChangePasswordIn` y `change_password`):
```python
@router.post("/change-password", status_code=204)
def change_password_endpoint(
    body: ChangePasswordIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> None:
    token = request.cookies.get(SESSION_COOKIE) or ""
    change_password(db, user, body.current_password, body.new_password, token, now)
```

`backend/app/cli.py`: agrega el subcomando y su rama (importa `create_user`):
```python
    create = sub.add_parser("create-user", help="Crea un usuario directamente (admin/e2e)")
    create.add_argument("email")
    create.add_argument("--password", required=True)
    create.add_argument("--name", required=True)
```
y en `main`, antes del `else` final:
```python
        elif args.command == "create-user":
            user = create_user(session, args.email, args.password, args.name)
            print(f"Usuario creado: {user.email}")
```
(Reestructura el `if/else` existente a `if invite / elif create-user / else reset`.)

En `backend/app/categories/service.py` y `backend/app/accounts/service.py` reemplaza el texto del 409 por los mensajes de **Interfaces**.

- [ ] **Step 4: Ver que pasan**

Run: `python -m uv run ruff check --fix . && python -m uv run ruff format . && python -m uv run mypy app && python -m uv run pytest -q`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(auth): add change-password endpoint, create-user CLI and clearer in-use messages"
```

---

### Task 2: Backend — guard de producción, límite de `start_date` y tests de aislamiento faltantes

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/main.py`
- Modify: `backend/app/recurring/router.py`, `backend/app/recurring/service.py`
- Modify: `backend/README.md`, `backend/.env.example`
- Test: `backend/tests/test_config_guard.py` (nuevo), `backend/tests/test_recurring.py`, `backend/tests/test_isolation.py` (nuevo)

**Interfaces:**
- Produces:
  - `Settings.environment: Literal["development", "production"] = "development"`.
  - `validate_production_settings(settings) -> list[str]` en `app/core/config.py` (lista de problemas); `create_app()` lanza `RuntimeError` con esos problemas si `environment == "production"` y la lista no está vacía.
  - Problemas detectados: `COOKIE_SECURE debe ser true`, `CRON_TOKEN no puede ser el valor de desarrollo`, `AI_PARSER debe ser claude`, `ANTHROPIC_API_KEY es obligatoria`.
  - `create_template(db, user_id, data, now)`: `422 START_DATE_TOO_OLD` si `start_date` < hoy local − 366 días.

- [ ] **Step 1: Tests que fallan**

`backend/tests/test_config_guard.py`:
```python
import pytest

from app.core.config import Settings, validate_production_settings


def test_development_has_no_checks():
    assert validate_production_settings(Settings(environment="development")) == []


def test_production_rejects_dev_defaults():
    problems = validate_production_settings(Settings(environment="production"))
    assert set(problems) == {
        "COOKIE_SECURE debe ser true",
        "CRON_TOKEN no puede ser el valor de desarrollo",
        "AI_PARSER debe ser claude",
        "ANTHROPIC_API_KEY es obligatoria",
    }


def test_production_ok():
    settings = Settings(
        environment="production",
        cookie_secure=True,
        cron_token="un-token-largo-y-aleatorio",
        ai_parser="claude",
        anthropic_api_key="sk-ant-test",
    )
    assert validate_production_settings(settings) == []


def test_create_app_refuses_bad_production_config(monkeypatch):
    from app.core import config
    from app.main import create_app

    monkeypatch.setattr(config.get_settings(), "environment", "production")
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        create_app()
```

En `backend/tests/test_recurring.py` agrega al inicio (después de los imports) un fixture autouse que fija el reloj, para que los tests no dependan de la fecha real:
```python
@pytest.fixture(autouse=True)
def fixed_now(set_now):
    set_now(datetime(2026, 10, 3, 15, 0, tzinfo=UTC))
```
y el test:
```python
def test_start_date_too_old_is_rejected(client_a, s):
    response = client_a.post(
        "/api/recurring",
        json={"type": "expense", "amount": 1, "account_id": s["debit"],
              "category_id": s["vivienda"], "day_of_month": 1, "start_date": "2025-10-01"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "START_DATE_TOO_OLD"
```

`backend/tests/test_isolation.py`:
```python
from tests.factories import category_id, create_account, insert_txn


def test_other_user_cannot_confirm_pending(client_a, client_b, db):
    debit = create_account(client_a)["id"]
    insert_txn(db, client_a, type="expense", amount=1000, date="2026-10-03",
               account_id=debit, category_id=category_id(client_a, "Comida"))
    pending = client_a.get("/api/transactions", params={"status": "pending"}).json()["items"][0]
    assert client_b.post(f"/api/transactions/{pending['id']}/confirm").status_code == 404


def test_budget_status_and_compare_are_scoped(client_a, client_b):
    debit = create_account(client_a)["id"]
    comida = category_id(client_a, "Comida")
    client_a.put("/api/budgets", json={"category_id": comida, "month": "2026-10", "amount": 100_000})
    client_a.post("/api/transactions", json={"type": "expense", "amount": 50_000, "date": "2026-10-03",
                                              "account_id": debit, "category_id": comida})
    items = client_b.get("/api/budgets/status", params={"month": "2026-10"}).json()["items"]
    assert all(i["spent"] == 0 and i["budget"] == 0 for i in items)
    body = client_b.get("/api/dashboard/compare", params={"months": 1, "until": "2026-10"}).json()
    assert body["months"][0]["expense"] == 0
    assert body["categories"] == []


def test_ai_context_excludes_other_users_names(app, client_a, client_b):
    from app.ai.deps import get_parser

    seen = []

    class Spy:
        def parse(self, text, ctx):
            seen.append(ctx)
            from app.ai.schemas import DraftTransaction
            return DraftTransaction()

    app.dependency_overrides[get_parser] = lambda: Spy()
    create_account(client_a, "Cuenta Secreta De Ana")
    client_b.post("/api/ai/parse-transaction", json={"text": "algo"})
    assert all(a.name != "Cuenta Secreta De Ana" for a in seen[0].accounts)
```

- [ ] **Step 2: Ver que fallan**

Run: `python -m uv run pytest tests/test_config_guard.py tests/test_recurring.py tests/test_isolation.py -q`
Expected: FAIL (`validate_production_settings` no existe; `START_DATE_TOO_OLD` no existe). Los tests de aislamiento deberían pasar ya (el código está bien aislado); si alguno falla, es un bug real: repórtalo.

- [ ] **Step 3: Implementación**

`backend/app/core/config.py`: agrega el campo `environment: Literal["development", "production"] = "development"` a `Settings` y la función:
```python
DEV_CRON_TOKEN = "dev-cron-token"


def validate_production_settings(settings: Settings) -> list[str]:
    if settings.environment != "production":
        return []
    problems = []
    if not settings.cookie_secure:
        problems.append("COOKIE_SECURE debe ser true")
    if settings.cron_token == DEV_CRON_TOKEN:
        problems.append("CRON_TOKEN no puede ser el valor de desarrollo")
    if settings.ai_parser != "claude":
        problems.append("AI_PARSER debe ser claude")
    if not settings.anthropic_api_key:
        problems.append("ANTHROPIC_API_KEY es obligatoria")
    return problems
```
(Usa `DEV_CRON_TOKEN` como default de `cron_token`.)

`backend/app/main.py`, al inicio de `create_app()` tras leer `settings`:
```python
    problems = validate_production_settings(settings)
    if problems:
        raise RuntimeError("Configuración de producción inválida: " + "; ".join(problems))
```

`backend/app/recurring/service.py`: `create_template` recibe `now: datetime` y, antes de validar la forma:
```python
    user = db.get(User, user_id)
    today = local_today(now, user.timezone if user else "America/Bogota")
    if data.start_date < today - timedelta(days=366):
        raise AppError(422, "START_DATE_TOO_OLD", "La fecha de inicio no puede ser de hace más de un año")
```
(importa `timedelta`). En `backend/app/recurring/router.py`, `create` añade `now: datetime = Depends(get_now)` y lo pasa.

`backend/.env.example`: agrega `ENVIRONMENT=development`. `backend/README.md`: agrega a la tabla `ENVIRONMENT` = `production` en Railway (el backend se niega a arrancar si faltan `COOKIE_SECURE=true`, un `CRON_TOKEN` propio, `AI_PARSER=claude` y `ANTHROPIC_API_KEY`).

- [ ] **Step 4: Ver que pasan**

Run: `python -m uv run ruff check --fix . && python -m uv run ruff format . && python -m uv run mypy app && python -m uv run pytest -q`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(backend): production config guard, recurring start_date bound and isolation tests"
```

---

### Task 3: Scaffold de Next.js, proxy a la API, Vitest y CI

**Files:**
- Create: `frontend/` (vía `create-next-app`), `frontend/next.config.ts`, `frontend/next.config.test.ts`
- Create: `frontend/vitest.config.mts`, `frontend/vitest.setup.ts`, `frontend/src/test/router.ts`, `frontend/.env.example`
- Modify: `frontend/package.json` (scripts), `frontend/src/app/layout.tsx`, `frontend/src/app/globals.css`
- Delete: `frontend/src/app/page.tsx`, `frontend/public/*.svg` (los del template)
- Create: `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Produces: `next.config.ts` con `rewrites()` → `[{ source: "/api/:path*", destination: "${BACKEND_URL}/api/:path*" }]` (`BACKEND_URL` por defecto `http://localhost:8000`); `mockRouter` (`push`, `replace`, `back`, `refresh`, `prefetch` como `vi.fn()`) en `src/test/router.ts`, usado por el mock global de `next/navigation`; scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `gen:api`, `e2e`.

- [ ] **Step 1: Generar el proyecto**

Run (desde la raíz del repo):
```bash
npx create-next-app@16 frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cd frontend
npm install @tanstack/react-query openapi-fetch
npm install -D openapi-typescript vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test
```
Expected: `frontend/` con `src/app/`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, Tailwind 4 configurado en `globals.css`. Si `create-next-app` pregunta algo no cubierto por los flags, acepta el valor por defecto.

- [ ] **Step 2: Limpiar el template**

Borra `src/app/page.tsx` y los SVG de `public/`. Reemplaza `src/app/globals.css` por:
```css
@import "tailwindcss";
```
Reemplaza `src/app/layout.tsx` por:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Finanzas personales",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Configurar Vitest**

`frontend/vitest.config.mts`:
```ts
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "next.config.test.ts"],
  },
});
```

`frontend/src/test/router.ts`:
```ts
import { vi } from "vitest";

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
```

`frontend/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { mockRouter } from "./src/test/router";

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
```

En `frontend/package.json`, la sección `scripts` queda:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "gen:api": "node scripts/gen-api.mjs",
  "e2e": "playwright test"
}
```

`frontend/.env.example`:
```
BACKEND_URL=http://localhost:8000
```

- [ ] **Step 4: Test que falla (proxy)**

`frontend/next.config.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("next.config rewrites", () => {
  it("proxies /api to the backend", async () => {
    process.env.BACKEND_URL = "http://backend:9000";
    const { default: config } = await import("./next.config");
    const rewrites = await config.rewrites!();
    expect(rewrites).toEqual([
      { source: "/api/:path*", destination: "http://backend:9000/api/:path*" },
    ]);
  });
});
```

Run: `npm test`
Expected: FAIL (`config.rewrites` es undefined en el `next.config.ts` del template).

- [ ] **Step 5: Implementación**

`frontend/next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 6: Ver que pasa y verificar el proyecto**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: 1 test pasa; lint, typecheck y build sin errores. Si `tsc` se queja de `next.config.test.ts` por tipos de Vitest, agrega `"types": ["vitest/globals"]` no es necesario (usamos imports explícitos); en cambio agrega `next.config.test.ts` a `exclude` de `tsconfig.json` solo si el error persiste, y anótalo en el reporte.

- [ ] **Step 7: CI**

`.github/workflows/frontend-ci.yml`:
```yaml
name: frontend
on:
  push:
    paths: ["frontend/**", ".github/workflows/frontend-ci.yml"]
  pull_request:
    paths: ["frontend/**", ".github/workflows/frontend-ci.yml"]
jobs:
  unit:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 8: Commit**

```bash
git add frontend .github/workflows/frontend-ci.yml
git commit -m "chore(frontend): scaffold Next.js app with API proxy, Vitest and CI"
```

---

### Task 4: Cliente de API tipado, errores y utilidades de test

**Files:**
- Create: `frontend/scripts/gen-api.mjs`, `frontend/src/lib/api/schema.d.ts` (generado), `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/errors.ts`
- Create: `frontend/src/test/fetch-mock.ts`, `frontend/src/test/render.tsx`
- Modify: `.gitignore` (agrega `frontend/openapi.json`)
- Test: `frontend/src/lib/api/errors.test.ts`, `frontend/src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: backend en `../backend` (para generar el OpenAPI).
- Produces:
  - `api` (cliente `openapi-fetch` tipado con `paths`), `type Schemas = components["schemas"]`.
  - `class ApiError extends Error { status: number; code: string; details: Record<string, unknown> }`.
  - `unwrap<T>(promise): Promise<T>` — lanza `ApiError` si la respuesta no es 2xx (código del cuerpo `error.code`) o `ApiError(0, "NETWORK_ERROR")` si `fetch` falla.
  - `messageFor(error: unknown): string` — mensaje en español por código.
  - `mockApi(routes: Record<"METHOD /path", Handler>) -> { calls }` donde `Handler = ({ body, url }) => { status?: number; body?: unknown }`; rutas no registradas responden 500 `NOT_MOCKED`.
  - `renderWithClient(ui) -> RenderResult & { client: QueryClient }` (QueryClient sin reintentos).

- [ ] **Step 1: Script de generación de tipos**

`frontend/scripts/gen-api.mjs`:
```js
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function uvCommand() {
  try {
    execSync("uv --version", { stdio: "ignore" });
    return "uv";
  } catch {
    return "python -m uv";
  }
}

const openapi = execSync(
  `${uvCommand()} run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))"`,
  { cwd: "../backend", encoding: "utf8" },
);
writeFileSync("openapi.json", openapi);
execSync("npx openapi-typescript openapi.json -o src/lib/api/schema.d.ts", { stdio: "inherit" });
```

Agrega `frontend/openapi.json` al `.gitignore` de la raíz.

Run: `npm run gen:api`
Expected: `src/lib/api/schema.d.ts` contiene `export interface paths` con `"/api/transactions"` y `components["schemas"]["DraftTransaction"]`.

- [ ] **Step 2: Tests que fallan**

`frontend/src/test/fetch-mock.ts`:
```ts
import { vi } from "vitest";

export type MockRequest = { body: unknown; url: URL };
export type Handler = (req: MockRequest) => { status?: number; body?: unknown };
export type MockCall = { method: string; path: string; body: unknown; url: URL };

export function mockApi(routes: Record<string, Handler>) {
  const calls: MockCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? JSON.parse(text) : undefined;
    const key = `${request.method} ${url.pathname}`;
    calls.push({ method: request.method, path: url.pathname, body, url });
    const handler = routes[key];
    if (!handler) {
      return json(500, { error: { code: "NOT_MOCKED", message: key, details: {} } });
    }
    const { status = 200, body: responseBody } = handler({ body, url });
    if (status === 204) return new Response(null, { status });
    return json(status, responseBody ?? null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function apiError(status: number, code: string, message = code) {
  return { status, body: { error: { code, message, details: {} } } };
}
```

`frontend/src/test/render.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...result, client };
}
```

`frontend/src/lib/api/errors.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError, messageFor, unwrap } from "./errors";

function result(status: number, body: unknown) {
  return Promise.resolve({
    data: status < 300 ? body : undefined,
    error: status >= 300 ? body : undefined,
    response: new Response(null, { status: status === 204 ? 204 : status }),
  });
}

describe("unwrap", () => {
  it("returns data on success", async () => {
    await expect(unwrap(result(200, { id: 1 }))).resolves.toEqual({ id: 1 });
  });

  it("throws ApiError with the backend code", async () => {
    const error = await unwrap(
      result(422, { error: { code: "ACCOUNT_ARCHIVED", message: "x", details: { a: 1 } } }),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("ACCOUNT_ARCHIVED");
    expect(error.details).toEqual({ a: 1 });
  });

  it("maps fetch failures to NETWORK_ERROR", async () => {
    const error = await unwrap(Promise.reject(new TypeError("Failed to fetch"))).catch((e) => e);
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBe(0);
  });
});

describe("messageFor", () => {
  it("uses the Spanish message for known codes", () => {
    expect(messageFor(new ApiError(503, "AI_UNAVAILABLE", "x"))).toBe(
      "No pude interpretarlo, complétalo a mano.",
    );
  });

  it("falls back to the server message, then a generic one", () => {
    expect(messageFor(new ApiError(409, "SOMETHING_NEW", "Mensaje del servidor"))).toBe(
      "Mensaje del servidor",
    );
    expect(messageFor(new Error("boom"))).toBe("Algo salió mal. Intenta de nuevo.");
    vi.restoreAllMocks();
  });
});
```

`frontend/src/lib/api/client.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { api } from "./client";
import { unwrap } from "./errors";

describe("api client", () => {
  it("calls the same-origin /api path through global fetch", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    const me = await unwrap(api.GET("/api/auth/me"));
    expect(me.email).toBe("ana@example.com");
    expect(calls[0].url.origin).toBe("http://localhost:3000");
  });

  it("serializes query params", async () => {
    const { calls } = mockApi({
      "GET /api/transactions": () => ({ body: { items: [], next_cursor: null } }),
    });
    await unwrap(api.GET("/api/transactions", { params: { query: { status: "pending", limit: 20 } } }));
    expect(calls[0].url.searchParams.get("status")).toBe("pending");
    expect(calls[0].url.searchParams.get("limit")).toBe("20");
  });
});
```

Run: `npm test`
Expected: FAIL (`./errors` y `./client` no existen).

- [ ] **Step 3: Implementación**

`frontend/src/lib/api/client.ts`:
```ts
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];

export const api = createClient<paths>({
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  // Se resuelve en cada llamada para que los tests puedan reemplazar fetch.
  fetch: (request: Request) => globalThis.fetch(request),
});
```

`frontend/src/lib/api/errors.ts`:
```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "No hay conexión con el servidor.",
  NOT_AUTHENTICATED: "Tu sesión terminó. Inicia sesión de nuevo.",
  INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
  LOGIN_RATE_LIMITED: "Demasiados intentos. Espera un minuto.",
  INVALID_INVITATION: "La invitación no es válida o ya expiró.",
  WRONG_PASSWORD: "La contraseña actual no es correcta.",
  VALIDATION_ERROR: "Revisa los datos del formulario.",
  AI_UNAVAILABLE: "No pude interpretarlo, complétalo a mano.",
  AI_RATE_LIMITED: "Hiciste muchas solicitudes seguidas. Regístralo a mano o intenta en un rato.",
  ACCOUNT_ARCHIVED: "Esa cuenta está archivada.",
  CATEGORY_ARCHIVED: "Esa categoría está archivada.",
  ACCOUNT_NAME_TAKEN: "Ya tienes una cuenta con ese nombre.",
  CATEGORY_NAME_TAKEN: "Ya tienes una categoría con ese nombre.",
  ACCOUNT_IN_USE: "La cuenta está en uso; archívala en su lugar.",
  CATEGORY_IN_USE: "La categoría está en uso; archívala en su lugar.",
  DUPLICATE_OCCURRENCE: "Ya existe ese movimiento recurrente en esa fecha.",
  START_DATE_TOO_OLD: "La fecha de inicio no puede ser de hace más de un año.",
  TRANSACTION_NOT_PENDING: "Ese movimiento ya estaba confirmado.",
};

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? (error.message || "Algo salió mal. Intenta de nuevo.");
  }
  return "Algo salió mal. Intenta de nuevo.";
}

type ErrorBody = { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
type FetchResult<T> = { data?: T; error?: unknown; response: Response };

export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Sin conexión");
  }
  if (!result.response.ok) {
    const body = (result.error ?? {}) as ErrorBody;
    throw new ApiError(
      result.response.status,
      body.error?.code ?? `HTTP_${result.response.status}`,
      body.error?.message ?? "",
      body.error?.details ?? {},
    );
  }
  return result.data as T;
}
```

- [ ] **Step 4: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todos pasan. Si `openapi-fetch` exige otra firma para la opción `fetch`, ajusta el tipo del parámetro a lo que pida `tsc` sin cambiar el comportamiento (resolver `globalThis.fetch` en cada llamada) y anótalo.

- [ ] **Step 5: Commit**

```bash
git add frontend .gitignore
git commit -m "feat(frontend): typed API client, error mapping and test helpers"
```

---

### Task 5: Utilidades de dinero, fechas y última cuenta usada

**Files:**
- Create: `frontend/src/lib/money.ts`, `frontend/src/lib/dates.ts`, `frontend/src/lib/last-account.ts`
- Test: `frontend/src/lib/money.test.ts`, `frontend/src/lib/dates.test.ts`, `frontend/src/lib/last-account.test.ts`

**Interfaces:**
- Produces:
  - `formatCOP(amount: number): string` → `"$1.250.000"`, `"-$50.000"`, `"$0"`.
  - `type ParsedAmount = { ok: true; value: number } | { ok: false; error: string }`; `parseAmount(input: string): ParsedAmount` — acepta `35000`, `35.000`, `$ 35.000`, `1.250.000`; rechaza vacío (`"Escribe el monto"`), `0` (`"El monto debe ser mayor que 0"`), decimales/comas/formatos raros (`"Usa solo pesos enteros, por ejemplo 35.000"`), > 1.000.000.000.000 (`"El monto es demasiado grande"`).
  - `todayISO(now = new Date()): string` (fecha en Bogotá `YYYY-MM-DD`); `currentMonth(now = new Date()): string` (`YYYY-MM`); `addMonths(month, n): string`; `monthRange(month): { from: string; to: string }` (primer y último día); `monthLabel(month): string` (`"octubre de 2026"`); `shortDate(iso): string` (`"3 oct"`).
  - `getLastAccountId(): string | null`; `setLastAccountId(id: string): void` (clave `finanzas.lastAccountId`; nunca lanza aunque `localStorage` falle).

- [ ] **Step 1: Tests que fallan**

`frontend/src/lib/money.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatCOP, parseAmount } from "./money";

describe("formatCOP", () => {
  it.each([
    [1250000, "$1.250.000"],
    [35000, "$35.000"],
    [999, "$999"],
    [1000, "$1.000"],
    [0, "$0"],
    [-50000, "-$50.000"],
  ])("%d → %s", (amount, expected) => {
    expect(formatCOP(amount)).toBe(expected);
  });
});

describe("parseAmount", () => {
  it.each([
    ["35000", 35000],
    ["35.000", 35000],
    ["$ 35.000", 35000],
    ["$1.250.000", 1250000],
    [" 1000 ", 1000],
  ])("accepts %s", (input, value) => {
    expect(parseAmount(input)).toEqual({ ok: true, value });
  });

  it.each([
    ["", "Escribe el monto"],
    ["0", "El monto debe ser mayor que 0"],
    ["35,5", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["35.5", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["3.50.000", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["abc", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["-5000", "Usa solo pesos enteros, por ejemplo 35.000"],
    ["1000000000001", "El monto es demasiado grande"],
  ])("rejects %s", (input, error) => {
    expect(parseAmount(input)).toEqual({ ok: false, error });
  });
});
```

`frontend/src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { addMonths, currentMonth, monthLabel, monthRange, shortDate, todayISO } from "./dates";

describe("todayISO", () => {
  it("uses Bogotá time near midnight", () => {
    // 04:30 UTC del 1-nov = 23:30 del 31-oct en Bogotá
    expect(todayISO(new Date("2026-11-01T04:30:00Z"))).toBe("2026-10-31");
    expect(todayISO(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-01");
  });

  it("currentMonth follows the Bogotá date", () => {
    expect(currentMonth(new Date("2026-11-01T04:30:00Z"))).toBe("2026-10");
  });
});

describe("month helpers", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("computes month ranges including leap years", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("formats labels in Spanish", () => {
    expect(monthLabel("2026-10")).toBe("octubre de 2026");
    expect(shortDate("2026-10-03")).toBe("3 oct");
  });
});
```

`frontend/src/lib/last-account.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getLastAccountId, setLastAccountId } from "./last-account";

describe("last account", () => {
  it("round-trips through localStorage", () => {
    expect(getLastAccountId()).toBeNull();
    setLastAccountId("acc-1");
    expect(getLastAccountId()).toBe("acc-1");
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setLastAccountId("x")).not.toThrow();
    expect(getLastAccountId()).toBeNull();
    vi.restoreAllMocks();
  });
});
```

Run: `npm test`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Implementación**

`frontend/src/lib/money.ts`:
```ts
const MAX_AMOUNT = 1_000_000_000_000;
const INVALID = "Usa solo pesos enteros, por ejemplo 35.000";

export function formatCOP(amount: number): string {
  const digits = Math.abs(Math.trunc(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}$${digits}`;
}

export type ParsedAmount = { ok: true; value: number } | { ok: false; error: string };

export function parseAmount(input: string): ParsedAmount {
  const cleaned = input.replace(/[\s$]/g, "");
  if (cleaned === "") return { ok: false, error: "Escribe el monto" };
  const plain = /^\d+$/.test(cleaned);
  const grouped = /^\d{1,3}(\.\d{3})+$/.test(cleaned);
  if (!plain && !grouped) return { ok: false, error: INVALID };
  const value = Number(cleaned.replace(/\./g, ""));
  if (value <= 0) return { ok: false, error: "El monto debe ser mayor que 0" };
  if (value > MAX_AMOUNT) return { ok: false, error: "El monto es demasiado grande" };
  return { ok: true, value };
}
```

`frontend/src/lib/dates.ts`:
```ts
const TIME_ZONE = "America/Bogota";
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

export function currentMonth(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}

function split(month: string): [number, number] {
  const [y, m] = month.split("-").map(Number);
  return [y, m];
}

export function addMonths(month: string, n: number): string {
  const [y, m] = split(month);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = split(month);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function monthLabel(month: string): string {
  const [y, m] = split(month);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
```

`frontend/src/lib/last-account.ts`:
```ts
const KEY = "finanzas.lastAccountId";

export function getLastAccountId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastAccountId(id: string): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Sin almacenamiento disponible: la cuenta por defecto simplemente no se recuerda.
  }
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todos pasan.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): COP money formatting/parsing, Bogotá dates and last-account storage"
```

---

### Task 6: Autenticación — providers, login, registro por invitación y guard de sesión

**Files:**
- Create: `frontend/src/app/providers.tsx`, `frontend/src/components/FormError.tsx`
- Create: `frontend/src/features/auth/api.ts`, `LoginForm.tsx`, `RegisterForm.tsx`, `ChangePasswordForm.tsx`, `AuthGuard.tsx`
- Create: `frontend/src/app/(auth)/login/page.tsx`, `frontend/src/app/(auth)/registro/page.tsx`, `frontend/src/app/(app)/layout.tsx`, `frontend/src/app/(app)/page.tsx` (provisional)
- Modify: `frontend/src/app/layout.tsx` (envuelve en `Providers`), `frontend/src/lib/api/schema.d.ts` (regenerar con `npm run gen:api`, que ahora incluye `change-password`)
- Test: `frontend/src/app/providers.test.tsx`, `frontend/src/features/auth/*.test.tsx`

**Interfaces:**
- Consumes: `api`, `unwrap`, `ApiError`, `messageFor`, `Schemas`, `mockApi`, `apiError`, `renderWithClient`, `mockRouter`.
- Produces:
  - `makeQueryClient(onUnauthorized?: () => void): QueryClient` — llama `onUnauthorized` solo ante `ApiError` con código `NOT_AUTHENTICATED` (consultas o mutaciones); por defecto redirige a `/login?next=<ruta actual>`. No reintenta errores 4xx.
  - `Providers` (cliente), `FormError({ error })` → `<p role="alert">` con `messageFor(error)` o nada.
  - Hooks en `features/auth/api.ts`: `meKey = ["me"]`, `useMe()`, `useLogin()`, `useRegister()`, `useLogout()`, `useChangePassword()`.
  - `safeNext(next: string | null): string` — solo rutas internas (`/x`, no `//x`); si no, `"/"`.
  - `AuthGuard({ children })` — "Cargando…" mientras carga, "Redirigiendo…" si 401, mensaje + botón "Reintentar" ante otros errores.

- [ ] **Step 1: Regenerar tipos**

Run (con el backend de Task 1 ya commiteado): `npm run gen:api`
Expected: `schema.d.ts` incluye `"/api/auth/change-password"` y `ChangePasswordIn`.

- [ ] **Step 2: Tests que fallan**

`frontend/src/app/providers.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { makeQueryClient } from "./providers";

describe("makeQueryClient", () => {
  it("calls onUnauthorized when a query fails with NOT_AUTHENTICATED", async () => {
    const onUnauthorized = vi.fn();
    const client = makeQueryClient(onUnauthorized);
    await client
      .fetchQuery({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new ApiError(401, "NOT_AUTHENTICATED", "")),
      })
      .catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("ignores other 401s such as wrong credentials", async () => {
    const onUnauthorized = vi.fn();
    const client = makeQueryClient(onUnauthorized);
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new ApiError(401, "INVALID_CREDENTIALS", "")),
    });
    await mutation.execute(undefined).catch(() => undefined);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
```

`frontend/src/features/auth/LoginForm.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import { LoginForm, safeNext } from "./LoginForm";

const user = { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" };

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
  await userEvent.type(screen.getByLabelText("Contraseña"), "clave-segura-123");
  await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("logs in and goes home", async () => {
    const { calls } = mockApi({ "POST /api/auth/login": () => ({ body: user }) });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(calls[0].body).toEqual({ email: "ana@example.com", password: "clave-segura-123" });
  });

  it("honors a safe next parameter", async () => {
    window.history.replaceState(null, "", "/login?next=/movimientos");
    mockApi({ "POST /api/auth/login": () => ({ body: user }) });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/movimientos"));
  });

  it("shows the error and keeps what was typed", async () => {
    mockApi({ "POST /api/auth/login": () => apiError(401, "INVALID_CREDENTIALS") });
    renderWithClient(<LoginForm />);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByLabelText("Email")).toHaveValue("ana@example.com");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("safeNext", () => {
  it.each([
    ["/movimientos", "/movimientos"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
```

`frontend/src/features/auth/RegisterForm.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import { RegisterForm } from "./RegisterForm";

async function fill(password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText("Tu nombre"), "Ana");
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.type(screen.getByLabelText("Repite la contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

describe("RegisterForm", () => {
  it("registers with the invitation token from the URL", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    const { calls } = mockApi({
      "POST /api/auth/register": () => ({
        status: 201,
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "clave-segura-123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(calls[0].body).toEqual({
      token: "tok-1234567890",
      password: "clave-segura-123",
      display_name: "Ana",
    });
  });

  it("validates matching passwords and minimum length before calling the API", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    const { calls } = mockApi({});
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "otra-clave-123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Las contraseñas no coinciden");
    await userEvent.clear(screen.getByLabelText("Contraseña"));
    await userEvent.clear(screen.getByLabelText("Repite la contraseña"));
    await userEvent.type(screen.getByLabelText("Contraseña"), "corta");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "corta");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(calls).toHaveLength(0);
  });

  it("explains a missing or invalid invitation", async () => {
    window.history.replaceState(null, "", "/registro");
    renderWithClient(<RegisterForm />);
    expect(screen.getByText(/necesitas un enlace de invitación/i)).toBeInTheDocument();
  });

  it("shows the server error for an expired invitation", async () => {
    window.history.replaceState(null, "", "/registro?token=tok-1234567890");
    mockApi({ "POST /api/auth/register": () => apiError(400, "INVALID_INVITATION") });
    renderWithClient(<RegisterForm />);
    await fill("clave-segura-123", "clave-segura-123");
    expect(await screen.findByRole("alert")).toHaveTextContent("La invitación no es válida");
  });
});
```

`frontend/src/features/auth/ChangePasswordForm.test.tsx`:
```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { ChangePasswordForm } from "./ChangePasswordForm";

async function submit(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByLabelText("Contraseña actual"), current);
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), next);
  await userEvent.type(screen.getByLabelText("Repite la nueva contraseña"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

describe("ChangePasswordForm", () => {
  it("changes the password and clears the fields", async () => {
    const { calls } = mockApi({ "POST /api/auth/change-password": () => ({ status: 204 }) });
    renderWithClient(<ChangePasswordForm />);
    await submit("clave-segura-123", "nueva-clave-456");
    expect(await screen.findByRole("status")).toHaveTextContent("Contraseña actualizada");
    expect(calls[0].body).toEqual({
      current_password: "clave-segura-123",
      new_password: "nueva-clave-456",
    });
    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });

  it("shows WRONG_PASSWORD", async () => {
    mockApi({ "POST /api/auth/change-password": () => apiError(400, "WRONG_PASSWORD") });
    renderWithClient(<ChangePasswordForm />);
    await submit("mala-clave-000", "nueva-clave-456");
    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta.");
  });
});
```

`frontend/src/features/auth/AuthGuard.test.tsx`:
```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { AuthGuard } from "./AuthGuard";

describe("AuthGuard", () => {
  it("renders children once the session is valid", async () => {
    mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
    });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(await screen.findByText("contenido privado")).toBeInTheDocument();
  });

  it("shows a redirect notice on 401", async () => {
    mockApi({ "GET /api/auth/me": () => apiError(401, "NOT_AUTHENTICATED") });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(await screen.findByText("Redirigiendo…")).toBeInTheDocument();
    expect(screen.queryByText("contenido privado")).not.toBeInTheDocument();
  });

  it("offers a retry on other errors", async () => {
    mockApi({ "GET /api/auth/me": () => apiError(500, "HTTP_500", "fallo") });
    renderWithClient(<AuthGuard><p>contenido privado</p></AuthGuard>);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
```

Run: `npm test`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementación**

`frontend/src/app/providers.tsx`:
```tsx
"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";

function redirectToLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export function makeQueryClient(onUnauthorized: () => void = redirectToLogin): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.code === "NOT_AUTHENTICATED") onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

En `frontend/src/app/layout.tsx`, el `<body>` queda `<body><Providers>{children}</Providers></body>` (importa `Providers` de `./providers`).

`frontend/src/components/FormError.tsx`:
```tsx
import { messageFor } from "@/lib/api/errors";

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert">{typeof error === "string" ? error : messageFor(error)}</p>;
}
```

`frontend/src/features/auth/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export const meKey = ["me"] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: () => unwrap(api.GET("/api/auth/me")) });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["LoginIn"]) => unwrap(api.POST("/api/auth/login", { body })),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["RegisterIn"]) => unwrap(api.POST("/api/auth/register", { body })),
    onSuccess: (user) => qc.setQueryData(meKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/auth/logout")),
    onSuccess: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: Schemas["ChangePasswordIn"]) =>
      unwrap(api.POST("/api/auth/change-password", { body })),
  });
}
```

`frontend/src/features/auth/LoginForm.tsx`:
```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useLogin } from "./api";

export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      router.replace(safeNext(params.get("next")));
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col">
        Email
        <input type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Contraseña
        <input type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <FormError error={login.error} />
      <button type="submit" disabled={login.isPending}>Entrar</button>
    </form>
  );
}
```

`frontend/src/features/auth/RegisterForm.tsx`:
```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useRegister } from "./api";

export function RegisterForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const register = useRegister();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!token) {
    return <p>Para crear tu cuenta necesitas un enlace de invitación.</p>;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setLocalError("La contraseña debe tener al menos 10 caracteres");
    if (password !== confirm) return setLocalError("Las contraseñas no coinciden");
    setLocalError(null);
    try {
      await register.mutateAsync({ token: token!, password, display_name: displayName });
      router.replace("/");
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col">
        Tu nombre
        <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Contraseña
        <input type="password" autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Repite la contraseña
        <input type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <FormError error={localError ?? register.error} />
      <button type="submit" disabled={register.isPending}>Crear cuenta</button>
    </form>
  );
}
```

`frontend/src/features/auth/ChangePasswordForm.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useChangePassword } from "./api";

export function ChangePasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next.length < 10) return setLocalError("La nueva contraseña debe tener al menos 10 caracteres");
    if (next !== confirm) return setLocalError("Las contraseñas no coinciden");
    setLocalError(null);
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      // El error se muestra con FormError.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col">
        Contraseña actual
        <input type="password" autoComplete="current-password" required value={current}
          onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Nueva contraseña
        <input type="password" autoComplete="new-password" required value={next}
          onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Repite la nueva contraseña
        <input type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <FormError error={localError ?? change.error} />
      {done && <p role="status">Contraseña actualizada</p>}
      <button type="submit" disabled={change.isPending}>Cambiar contraseña</button>
    </form>
  );
}
```

`frontend/src/features/auth/AuthGuard.tsx`:
```tsx
"use client";

import { ApiError } from "@/lib/api/errors";
import { FormError } from "@/components/FormError";
import { useMe } from "./api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isPending) return <p>Cargando…</p>;
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <p>Redirigiendo…</p>;
    return (
      <div>
        <FormError error={me.error} />
        <button type="button" onClick={() => me.refetch()}>Reintentar</button>
      </div>
    );
  }
  return <>{children}</>;
}
```

`frontend/src/app/(auth)/login/page.tsx`:
```tsx
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1>Finanzas</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
```

`frontend/src/app/(auth)/registro/page.tsx`:
```tsx
import { Suspense } from "react";
import { RegisterForm } from "@/features/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-4">
      <h1>Crea tu cuenta</h1>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
```

`frontend/src/app/(app)/layout.tsx` (provisional; Task 7 agrega el `AppShell`):
```tsx
"use client";

import { AuthGuard } from "@/features/auth/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
```

`frontend/src/app/(app)/page.tsx` (provisional; Task 12 lo reemplaza):
```tsx
export default function HomePage() {
  return <h1>Inicio</h1>;
}
```

- [ ] **Step 4: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): login, invitation signup, session guard and 401 redirect"
```

---

### Task 7: Shell de la app, navegación inferior, "Más" y "Mi cuenta"

**Files:**
- Create: `frontend/src/components/AppShell.tsx`, `frontend/src/app/(app)/mas/page.tsx`, `frontend/src/app/(app)/mas/cuenta/page.tsx`
- Modify: `frontend/src/app/(app)/layout.tsx`
- Test: `frontend/src/components/AppShell.test.tsx`, `frontend/src/app/(app)/mas/cuenta/page.test.tsx`

**Interfaces:**
- Consumes: `useMe`, `useLogout`, `ChangePasswordForm`, `mockRouter`.
- Produces:
  - `NAV_ITEMS` = Inicio `/`, Movimientos `/movimientos`, Registrar `/registrar`, Presupuestos `/presupuestos`, Más `/mas`.
  - `AppShell({ children })` — `<main>` + `<nav aria-label="Principal">` fijo abajo; el enlace activo lleva `aria-current="page"` (coincidencia exacta para `/`, por prefijo para el resto).
  - Página "Más": enlaces Cuentas `/mas/cuentas`, Categorías `/mas/categorias`, Recurrentes `/mas/recurrentes`, Págate primero `/mas/ahorro`, Comparar meses `/comparar`, Mi cuenta `/mas/cuenta`.
  - Página "Mi cuenta": email del usuario, `ChangePasswordForm`, botón "Cerrar sesión" (POST logout → `router.replace("/login")`).

- [ ] **Step 1: Tests que fallan**

`frontend/src/components/AppShell.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the main navigation", () => {
    render(<AppShell><p>hola</p></AppShell>);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    for (const name of ["Inicio", "Movimientos", "Registrar", "Presupuestos", "Más"]) {
      expect(nav).toContainElement(screen.getByRole("link", { name }));
    }
    expect(screen.getByText("hola")).toBeInTheDocument();
  });

  it("marks the active section", () => {
    window.history.replaceState(null, "", "/movimientos");
    render(<AppShell><p /></AppShell>);
    expect(screen.getByRole("link", { name: "Movimientos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("marks Más for nested settings pages", () => {
    window.history.replaceState(null, "", "/mas/cuentas");
    render(<AppShell><p /></AppShell>);
    expect(screen.getByRole("link", { name: "Más" })).toHaveAttribute("aria-current", "page");
  });
});
```

`frontend/src/app/(app)/mas/cuenta/page.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { mockRouter } from "@/test/router";
import AccountPage from "./page";

describe("Mi cuenta", () => {
  it("shows the email and logs out", async () => {
    const { calls } = mockApi({
      "GET /api/auth/me": () => ({
        body: { id: "u1", email: "ana@example.com", display_name: "Ana", timezone: "America/Bogota" },
      }),
      "POST /api/auth/logout": () => ({ status: 204 }),
    });
    renderWithClient(<AccountPage />);
    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(calls.some((c) => c.path === "/api/auth/logout")).toBe(true);
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/components/AppShell.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/", label: "Inicio" },
  { href: "/movimientos", label: "Movimientos" },
  { href: "/registrar", label: "Registrar" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/mas", label: "Más" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 p-4 pb-24">{children}</main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 border-t bg-white">
        <ul className="mx-auto flex max-w-xl justify-between p-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
```

`frontend/src/app/(app)/layout.tsx`:
```tsx
"use client";

import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
```

`frontend/src/app/(app)/mas/page.tsx`:
```tsx
import Link from "next/link";

const LINKS = [
  { href: "/mas/cuentas", label: "Cuentas" },
  { href: "/mas/categorias", label: "Categorías" },
  { href: "/mas/recurrentes", label: "Recurrentes" },
  { href: "/mas/ahorro", label: "Págate primero" },
  { href: "/comparar", label: "Comparar meses" },
  { href: "/mas/cuenta", label: "Mi cuenta" },
];

export default function MorePage() {
  return (
    <section className="flex flex-col gap-3">
      <h1>Más</h1>
      <ul className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`frontend/src/app/(app)/mas/cuenta/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { ChangePasswordForm } from "@/features/auth/ChangePasswordForm";
import { useLogout, useMe } from "@/features/auth/api";

export default function AccountPage() {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  async function onLogout() {
    await logout.mutateAsync().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <section className="flex flex-col gap-4">
      <h1>Mi cuenta</h1>
      {me.data && <p>{me.data.email}</p>}
      <h2>Cambiar contraseña</h2>
      <ChangePasswordForm />
      <button type="button" onClick={onLogout} disabled={logout.isPending}>Cerrar sesión</button>
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): app shell with bottom navigation, settings menu and account page"
```

---

### Task 8: Cuentas y categorías (gestión)

**Files:**
- Create: `frontend/src/components/ConfirmButton.tsx`
- Create: `frontend/src/features/accounts/api.ts`, `frontend/src/features/accounts/AccountsManager.tsx`
- Create: `frontend/src/features/categories/api.ts`, `frontend/src/features/categories/CategoriesManager.tsx`
- Create: `frontend/src/app/(app)/mas/cuentas/page.tsx`, `frontend/src/app/(app)/mas/categorias/page.tsx`
- Test: `frontend/src/components/ConfirmButton.test.tsx`, `frontend/src/features/accounts/AccountsManager.test.tsx`, `frontend/src/features/categories/CategoriesManager.test.tsx`

**Interfaces:**
- Consumes: `api`, `unwrap`, `Schemas`, `formatCOP`, `parseAmount`, `FormError`, `mockApi`, `apiError`, `renderWithClient`.
- Produces:
  - `ConfirmButton({ label, confirmLabel = "Sí, borrar", onConfirm })` — primer clic muestra "¿Seguro?" con botones `confirmLabel` y "Cancelar" (sin diálogos nativos).
  - `features/accounts/api.ts`: `ACCOUNT_TYPE_LABELS` (`cash` Efectivo, `debit` Débito, `savings` Ahorro, `credit_card` Tarjeta de crédito), `useAccounts(includeArchived = false)` (clave `["accounts", { includeArchived }]`), `useCreateAccount()`, `useUpdateAccount()` (variables `{ id, ...AccountUpdate }`), `useDeleteAccount()` (variable `id`); todas las mutaciones invalidan `["accounts"]`.
  - `parseSignedAmount(input): ParsedAmount` — vacío → `0`; prefijo `-` permitido (saldo de tarjeta).
  - `features/categories/api.ts`: `useCategories(includeArchived = false)` (clave `["categories", { includeArchived }]`), `useCreateCategory()`, `useUpdateCategory()` (`{ id, ...CategoryUpdate }`), `useDeleteCategory()`; invalidan `["categories"]`.
  - `AccountsManager`, `CategoriesManager`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/components/ConfirmButton.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton } from "./ConfirmButton";

describe("ConfirmButton", () => {
  it("asks before confirming", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Borrar" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(screen.getByText("¿Seguro?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
```

`frontend/src/features/accounts/AccountsManager.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { AccountsManager, parseSignedAmount } from "./AccountsManager";

const debit = { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 1250000 };

describe("parseSignedAmount", () => {
  it("accepts empty and negative values", () => {
    expect(parseSignedAmount("")).toEqual({ ok: true, value: 0 });
    expect(parseSignedAmount("-150.000")).toEqual({ ok: true, value: -150000 });
    expect(parseSignedAmount("20.000")).toEqual({ ok: true, value: 20000 });
    expect(parseSignedAmount("1,5").ok).toBe(false);
  });
});

describe("AccountsManager", () => {
  it("lists accounts with their balance", async () => {
    mockApi({ "GET /api/accounts": () => ({ body: [debit] }) });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    expect(within(row).getByText("Débito")).toBeInTheDocument();
    expect(within(row).getByText("$1.250.000")).toBeInTheDocument();
  });

  it("creates an account with a negative initial balance", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [] }),
      "POST /api/accounts": () => ({ status: 201, body: { ...debit, id: "a2", name: "Nu", type: "credit_card" } }),
    });
    renderWithClient(<AccountsManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la cuenta"), "Nu");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "credit_card");
    await userEvent.type(screen.getByLabelText("Saldo inicial"), "-150.000");
    await userEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      name: "Nu", type: "credit_card", initial_balance: -150000,
    });
  });

  it("keeps the typed name when the server rejects a duplicate", async () => {
    mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "POST /api/accounts": () => apiError(409, "ACCOUNT_NAME_TAKEN"),
    });
    renderWithClient(<AccountsManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la cuenta"), "bancolombia");
    await userEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tienes una cuenta con ese nombre.");
    expect(screen.getByLabelText("Nombre de la cuenta")).toHaveValue("bancolombia");
  });

  it("archives and deletes accounts", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "PATCH /api/accounts/a1": () => ({ body: { ...debit, archived: true } }),
      "DELETE /api/accounts/a1": () => ({ status: 204 }),
    });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Archivar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ archived: true }),
    );
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("renames inline", async () => {
    const { calls } = mockApi({
      "GET /api/accounts": () => ({ body: [debit] }),
      "PATCH /api/accounts/a1": () => ({ body: { ...debit, name: "Bancolombia nómina" } }),
    });
    renderWithClient(<AccountsManager />);
    const row = (await screen.findByText("Bancolombia")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Renombrar" }));
    const input = within(row).getByLabelText("Nuevo nombre");
    await userEvent.clear(input);
    await userEvent.type(input, "Bancolombia nómina");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ name: "Bancolombia nómina" }),
    );
  });
});
```

`frontend/src/features/categories/CategoriesManager.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { CategoriesManager } from "./CategoriesManager";

const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];

describe("CategoriesManager", () => {
  it("groups categories by kind", async () => {
    mockApi({ "GET /api/categories": () => ({ body: categories }) });
    renderWithClient(<CategoriesManager />);
    const expenses = await screen.findByRole("region", { name: "Gastos" });
    const incomes = screen.getByRole("region", { name: "Ingresos" });
    expect(within(expenses).getByText("Comida")).toBeInTheDocument();
    expect(within(incomes).getByText("Salario")).toBeInTheDocument();
  });

  it("creates a category", async () => {
    const { calls } = mockApi({
      "GET /api/categories": () => ({ body: categories }),
      "POST /api/categories": () => ({ status: 201, body: { id: "c3", name: "Mascotas", kind: "expense", archived: false } }),
    });
    renderWithClient(<CategoriesManager />);
    await userEvent.type(await screen.findByLabelText("Nombre de la categoría"), "Mascotas");
    await userEvent.selectOptions(screen.getByLabelText("Clase"), "expense");
    await userEvent.click(screen.getByRole("button", { name: "Agregar categoría" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Mascotas", kind: "expense" }),
    );
  });

  it("explains why a category in use cannot be deleted", async () => {
    mockApi({
      "GET /api/categories": () => ({ body: categories }),
      "DELETE /api/categories/c1": () => apiError(409, "CATEGORY_IN_USE"),
    });
    renderWithClient(<CategoriesManager />);
    const row = (await screen.findByText("Comida")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La categoría está en uso");
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/components/ConfirmButton.tsx`:
```tsx
"use client";

import { useState } from "react";

type Props = { label: string; confirmLabel?: string; onConfirm: () => void };

export function ConfirmButton({ label, confirmLabel = "Sí, borrar", onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="inline-flex gap-2">
      <span>¿Seguro?</span>
      <button type="button" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" onClick={() => setAsking(false)}>Cancelar</button>
    </span>
  );
}
```

`frontend/src/features/accounts/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Account = Schemas["AccountOut"];
export type AccountType = Account["type"];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Efectivo",
  debit: "Débito",
  savings: "Ahorro",
  credit_card: "Tarjeta de crédito",
};

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ["accounts", { includeArchived }],
    queryFn: () =>
      unwrap(api.GET("/api/accounts", { params: { query: { include_archived: includeArchived } } })),
  });
}

function useInvalidateAccounts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["accounts"] });
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (body: Schemas["AccountCreate"]) => unwrap(api.POST("/api/accounts", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["AccountUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/accounts/{account_id}", { params: { path: { account_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAccounts();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/accounts/{account_id}", { params: { path: { account_id: id } } })),
    onSuccess: invalidate,
  });
}
```

`frontend/src/features/accounts/AccountsManager.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { formatCOP, parseAmount, type ParsedAmount } from "@/lib/money";
import {
  ACCOUNT_TYPE_LABELS, type Account, type AccountType,
  useAccounts, useCreateAccount, useDeleteAccount, useUpdateAccount,
} from "./api";

export function parseSignedAmount(input: string): ParsedAmount {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: 0 };
  const negative = trimmed.startsWith("-");
  const parsed = parseAmount(negative ? trimmed.slice(1) : trimmed);
  if (!parsed.ok) return parsed;
  return { ok: true, value: negative ? -parsed.value : parsed.value };
}

function AccountRow({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.name);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: account.id, name });
      setRenaming(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{account.name}</span>
        <span>{formatCOP(account.balance)}</span>
      </div>
      <span>{ACCOUNT_TYPE_LABELS[account.type]}{account.archived ? " · archivada" : ""}</span>
      {renaming ? (
        <form onSubmit={saveName} className="flex gap-2">
          <label>
            Nuevo nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">Guardar</button>
          <button type="button" onClick={() => setRenaming(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRenaming(true)}>Renombrar</button>
          <button type="button" onClick={() => update.mutate({ id: account.id, archived: !account.archived })}>
            {account.archived ? "Restaurar" : "Archivar"}
          </button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(account.id)} />
        </div>
      )}
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

export function AccountsManager() {
  const [showArchived, setShowArchived] = useState(false);
  const accounts = useAccounts(showArchived);
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("debit");
  const [initial, setInitial] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSignedAmount(initial);
    if (!parsed.ok) return setLocalError(parsed.error);
    setLocalError(null);
    try {
      await create.mutateAsync({ name, type, initial_balance: parsed.value });
      setName("");
      setInitial("");
    } catch {
      // Error visible abajo; los valores se conservan.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex gap-2">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Mostrar archivadas
      </label>
      <FormError error={accounts.error} />
      <ul>{accounts.data?.map((a) => <AccountRow key={a.id} account={a} />)}</ul>
      <form onSubmit={onCreate} className="flex flex-col gap-2">
        <h2>Nueva cuenta</h2>
        <label className="flex flex-col">
          Nombre de la cuenta
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          Saldo inicial
          <input inputMode="numeric" placeholder="0" value={initial} onChange={(e) => setInitial(e.target.value)} />
        </label>
        <FormError error={localError ?? create.error} />
        <button type="submit" disabled={create.isPending}>Agregar cuenta</button>
      </form>
    </div>
  );
}
```

`frontend/src/features/categories/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Category = Schemas["CategoryOut"];
export type CategoryKind = Category["kind"];

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: ["categories", { includeArchived }],
    queryFn: () =>
      unwrap(api.GET("/api/categories", { params: { query: { include_archived: includeArchived } } })),
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["categories"] });
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (body: Schemas["CategoryCreate"]) => unwrap(api.POST("/api/categories", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["CategoryUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/categories/{category_id}", { params: { path: { category_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/categories/{category_id}", { params: { path: { category_id: id } } })),
    onSuccess: invalidate,
  });
}
```

`frontend/src/features/categories/CategoriesManager.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import {
  type Category, type CategoryKind,
  useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory,
} from "./api";

function CategoryRow({ category }: { category: Category }) {
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({ id: category.id, name });
      setRenaming(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <span>{category.name}{category.archived ? " · archivada" : ""}</span>
      {renaming ? (
        <form onSubmit={saveName} className="flex gap-2">
          <label>
            Nuevo nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">Guardar</button>
          <button type="button" onClick={() => setRenaming(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRenaming(true)}>Renombrar</button>
          <button type="button" onClick={() => update.mutate({ id: category.id, archived: !category.archived })}>
            {category.archived ? "Restaurar" : "Archivar"}
          </button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(category.id)} />
        </div>
      )}
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

const GROUPS: { kind: CategoryKind; title: string }[] = [
  { kind: "expense", title: "Gastos" },
  { kind: "income", title: "Ingresos" },
];

export function CategoriesManager() {
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories(showArchived);
  const create = useCreateCategory();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    try {
      await create.mutateAsync({ name, kind });
      setName("");
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex gap-2">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Mostrar archivadas
      </label>
      <FormError error={categories.error} />
      {GROUPS.map((group) => (
        <section key={group.kind} aria-label={group.title}>
          <h2>{group.title}</h2>
          <ul>
            {categories.data?.filter((c) => c.kind === group.kind).map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        </section>
      ))}
      <form onSubmit={onCreate} className="flex flex-col gap-2">
        <h2>Nueva categoría</h2>
        <label className="flex flex-col">
          Nombre de la categoría
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="flex flex-col">
          Clase
          <select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>
        <FormError error={create.error} />
        <button type="submit" disabled={create.isPending}>Agregar categoría</button>
      </form>
    </div>
  );
}
```

`frontend/src/app/(app)/mas/cuentas/page.tsx`:
```tsx
import { AccountsManager } from "@/features/accounts/AccountsManager";

export default function AccountsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Cuentas</h1>
      <AccountsManager />
    </section>
  );
}
```

`frontend/src/app/(app)/mas/categorias/page.tsx`:
```tsx
import { CategoriesManager } from "@/features/categories/CategoriesManager";

export default function CategoriesPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Categorías</h1>
      <CategoriesManager />
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): manage accounts and categories"
```

---

### Task 9: Formulario de movimiento y retroalimentación al guardar (presupuesto y "págate primero")

**Files:**
- Create: `frontend/src/features/transactions/api.ts`, `TransactionForm.tsx`, `SaveFeedback.tsx`
- Test: `frontend/src/features/transactions/TransactionForm.test.tsx`, `frontend/src/features/transactions/SaveFeedback.test.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `useCategories`, `parseAmount`, `formatCOP`, `todayISO`, `getLastAccountId`, `setLastAccountId`, `messageFor`, `FormError`.
- Produces:
  - `features/transactions/api.ts`: tipos `Transaction`, `TransactionSaved`, `TransactionType`, `BudgetStatus = Schemas["BudgetStatusItem"]`, `SavingsSuggestion`; `useInvalidateMoney()` (invalida `["transactions"]`, `["accounts"]`, `["dashboard"]`, `["budgets"]`); `useCreateTransaction()`, `useUpdateTransaction()` (`{ id, ...TransactionUpdate }`), `useConfirmTransaction()` (`{ id, ...TransactionUpdate }`), `useDeleteTransaction()` (`id`).
  - `type TransactionFormValues = { type; amount: number; date: string; account_id: string; to_account_id: string | null; category_id: string | null; description: string | null }`.
  - `TransactionForm({ initial?, missingFields?, submitLabel, onSubmit, onCancel? })` — `onSubmit(values): Promise<void>`; si lanza, muestra `messageFor(error)` y conserva los valores. Valores por defecto: fecha = `todayISO()`, cuenta = última usada si sigue activa. Campos en `missingFields` llevan `aria-invalid="true"` y el texto "Revisa este dato". Al guardar con éxito llama `setLastAccountId`.
  - `SaveFeedback({ result, onDone })` — "Movimiento guardado"; alerta de presupuesto si `level` es `warning` o `exceeded`; sugerencia de ahorro editable con "Apartar" (crea transferencia `source: "savings_rule"`) y "Ahora no"; botón "Listo" llama `onDone`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/features/transactions/TransactionForm.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { todayISO } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { TransactionForm } from "./TransactionForm";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];

function setup() {
  mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
  });
}

describe("TransactionForm", () => {
  it("prefills values and highlights missing fields", async () => {
    setup();
    renderWithClient(
      <TransactionForm
        initial={{ type: "expense", category_id: "c1", description: "Almuerzo" }}
        missingFields={["amount", "account_id"]}
        submitLabel="Guardar"
        onSubmit={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText("Categoría")).toHaveValue("c1");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Almuerzo");
    expect(screen.getByLabelText("Monto")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Cuenta")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Fecha")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Revisa este dato")).toHaveLength(2);
  });

  it("defaults date to today in Bogotá and account to the last one used", async () => {
    window.localStorage.setItem("finanzas.lastAccountId", "a2");
    setup();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Cuenta")).toHaveValue("a2"));
    expect(screen.getByLabelText("Fecha")).toHaveValue(todayISO());
  });

  it("submits an expense with the parsed amount and remembers the account", async () => {
    setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.type(screen.getByLabelText("Descripción"), "Almuerzo");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "expense",
      amount: 35000,
      date: todayISO(),
      account_id: "a1",
      to_account_id: null,
      category_id: "c1",
      description: "Almuerzo",
    });
    expect(window.localStorage.getItem("finanzas.lastAccountId")).toBe("a1");
  });

  it("only offers categories of the selected type", async () => {
    setup();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={vi.fn()} />);
    const select = await screen.findByLabelText("Categoría");
    expect(select).toContainElement(screen.getByRole("option", { name: "Comida" }));
    expect(screen.queryByRole("option", { name: "Salario" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Ingreso" }));
    expect(screen.getByRole("option", { name: "Salario" })).toBeInTheDocument();
  });

  it("asks for a destination on transfers and hides the category", async () => {
    setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.click(await screen.findByRole("radio", { name: "Transferencia" }));
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Monto"), "600000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige la cuenta de destino");
    await userEvent.selectOptions(screen.getByLabelText("Hacia la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "transfer", to_account_id: "a2", category_id: null }),
      ),
    );
  });

  it("validates before submitting", async () => {
    setup();
    const onSubmit = vi.fn();
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35,5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Usa solo pesos enteros");
    expect(alert).toHaveTextContent("Elige una cuenta");
    expect(alert).toHaveTextContent("Elige una categoría");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps every value when the server rejects the save", async () => {
    setup();
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "ACCOUNT_ARCHIVED", ""));
    renderWithClient(<TransactionForm submitLabel="Guardar" onSubmit={onSubmit} />);
    await userEvent.type(await screen.findByLabelText("Monto"), "35.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta está archivada.");
    expect(screen.getByLabelText("Monto")).toHaveValue("35.000");
    expect(screen.getByLabelText("Cuenta")).toHaveValue("a1");
    expect(screen.getByLabelText("Categoría")).toHaveValue("c1");
  });
});
```

`frontend/src/features/transactions/SaveFeedback.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { SaveFeedback } from "./SaveFeedback";

const transaction = {
  id: "t1", type: "income", amount: 3000000, date: "2026-10-01", account_id: "a1",
  to_account_id: null, category_id: "c2", description: null, status: "confirmed",
  source: "manual", created_at: "2026-10-01T12:00:00Z", recurring_template_id: null,
};

describe("SaveFeedback", () => {
  it("warns when a budget is close to its limit", () => {
    renderWithClient(
      <SaveFeedback
        result={{
          transaction: { ...transaction, type: "expense" },
          budget_status: {
            category_id: "c1", category_name: "Comida", budget: 100000, spent: 85000,
            remaining: 15000, percent: 85, level: "warning", committed: 0,
          },
          savings_suggestion: null,
        }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Movimiento guardado");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Llevas 85% del presupuesto de Comida ($85.000 de $100.000).",
    );
  });

  it("tells when the budget is exceeded", () => {
    renderWithClient(
      <SaveFeedback
        result={{
          transaction: { ...transaction, type: "expense" },
          budget_status: {
            category_id: "c1", category_name: "Comida", budget: 100000, spent: 120000,
            remaining: -20000, percent: 120, level: "exceeded", committed: 0,
          },
          savings_suggestion: null,
        }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Te pasaste del presupuesto de Comida: $120.000 de $100.000.",
    );
  });

  it("creates the savings transfer when accepted, with the edited amount", async () => {
    const { calls } = mockApi({
      "POST /api/transactions": () => ({
        status: 201,
        body: { transaction: { ...transaction, id: "t2", type: "transfer" }, budget_status: null, savings_suggestion: null },
      }),
    });
    renderWithClient(
      <SaveFeedback
        result={{
          transaction,
          budget_status: null,
          savings_suggestion: { amount: 600000, from_account_id: "a1", to_account_id: "a9", date: "2026-10-01" },
        }}
        onDone={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Monto a apartar");
    expect(amount).toHaveValue("600.000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "500.000");
    await userEvent.click(screen.getByRole("button", { name: "Apartar" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      type: "transfer", amount: 500000, date: "2026-10-01",
      account_id: "a1", to_account_id: "a9", source: "savings_rule",
    });
    expect(await screen.findByText("Listo, apartaste $500.000.")).toBeInTheDocument();
  });

  it("can dismiss the suggestion and finish", async () => {
    const onDone = vi.fn();
    renderWithClient(
      <SaveFeedback
        result={{
          transaction,
          budget_status: null,
          savings_suggestion: { amount: 600000, from_account_id: "a1", to_account_id: "a9", date: "2026-10-01" },
        }}
        onDone={onDone}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByLabelText("Monto a apartar")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onDone).toHaveBeenCalled();
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/features/transactions/api.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type Transaction = Schemas["TransactionOut"];
export type TransactionSaved = Schemas["TransactionSaved"];
export type TransactionType = Transaction["type"];
export type BudgetStatus = Schemas["BudgetStatusItem"];
export type SavingsSuggestion = Schemas["SavingsSuggestion"];

export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["transactions", "accounts", "dashboard", "budgets"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: Schemas["TransactionCreate"]) => unwrap(api.POST("/api/transactions", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["TransactionUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/transactions/{transaction_id}", {
        params: { path: { transaction_id: id } },
        body,
      })),
    onSuccess: invalidate,
  });
}

export function useConfirmTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["TransactionUpdate"] & { id: string }) =>
      unwrap(api.POST("/api/transactions/{transaction_id}/confirm", {
        params: { path: { transaction_id: id } },
        body,
      })),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/transactions/{transaction_id}", {
        params: { path: { transaction_id: id } },
      })),
    onSuccess: invalidate,
  });
}
```
(Si el tipo generado para el cuerpo de `confirm` difiere — por ejemplo opcional o `null` — ajusta solo la anotación para que `tsc` pase, enviando siempre el objeto de cambios.)

`frontend/src/features/transactions/TransactionForm.tsx`:
```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { messageFor } from "@/lib/api/errors";
import { todayISO } from "@/lib/dates";
import { getLastAccountId, setLastAccountId } from "@/lib/last-account";
import { formatCOP, parseAmount } from "@/lib/money";
import type { TransactionType } from "./api";

export type TransactionFormValues = {
  type: TransactionType;
  amount: number;
  date: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  description: string | null;
};

type Initial = Partial<{
  type: TransactionType | null;
  amount: number | null;
  date: string | null;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string | null;
}>;

type Props = {
  initial?: Initial;
  missingFields?: string[];
  submitLabel: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  onCancel?: () => void;
};

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "income", label: "Ingreso" },
  { value: "transfer", label: "Transferencia" },
];

export function TransactionForm({ initial = {}, missingFields = [], submitLabel, onSubmit, onCancel }: Props) {
  const accounts = useAccounts();
  const categories = useCategories();
  const [type, setType] = useState<TransactionType>(initial.type ?? "expense");
  const [amountText, setAmountText] = useState(initial.amount ? formatCOP(initial.amount).slice(1) : "");
  const [date, setDate] = useState(initial.date ?? todayISO());
  const [accountId, setAccountId] = useState(initial.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(initial.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState(initial.category_id ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accountId || !accounts.data) return;
    const last = getLastAccountId();
    if (last && accounts.data.some((a) => a.id === last)) setAccountId(last);
  }, [accounts.data, accountId]);

  const kindCategories = (categories.data ?? []).filter((c) => c.kind === type);

  function changeType(next: TransactionType) {
    setType(next);
    if (!(categories.data ?? []).some((c) => c.id === categoryId && c.kind === next)) setCategoryId("");
    if (next !== "transfer") setToAccountId("");
  }

  const missing = (field: string) => missingFields.includes(field);
  const fieldProps = (field: string) => ({
    "aria-invalid": missing(field) ? (true as const) : undefined,
    "aria-describedby": missing(field) ? `${field}-missing` : undefined,
  });
  const hint = (field: string) =>
    missing(field) ? <span id={`${field}-missing`}>Revisa este dato</span> : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    const parsed = parseAmount(amountText);
    if (!parsed.ok) problems.push(parsed.error);
    if (!date) problems.push("Elige la fecha");
    if (!accountId) problems.push("Elige una cuenta");
    if (type === "transfer") {
      if (!toAccountId) problems.push("Elige la cuenta de destino");
      else if (toAccountId === accountId) problems.push("La cuenta de destino debe ser distinta");
    } else if (!categoryId) {
      problems.push("Elige una categoría");
    }
    setErrors(problems);
    if (problems.length > 0 || !parsed.ok) return;

    setSaving(true);
    try {
      await onSubmit({
        type,
        amount: parsed.value,
        date,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        description: description.trim() || null,
      });
      setLastAccountId(accountId);
    } catch (error) {
      setErrors([messageFor(error)]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <fieldset {...fieldProps("type")}>
        <legend>Tipo</legend>
        {TYPES.map((t) => (
          <label key={t.value} className="mr-3">
            <input type="radio" name="type" value={t.value} checked={type === t.value}
              onChange={() => changeType(t.value)} />
            {t.label}
          </label>
        ))}
        {hint("type")}
      </fieldset>

      <label className="flex flex-col">
        Monto
        <input inputMode="numeric" placeholder="35.000" value={amountText}
          onChange={(e) => setAmountText(e.target.value)} {...fieldProps("amount")} />
        {hint("amount")}
      </label>

      <label className="flex flex-col">
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} {...fieldProps("date")} />
        {hint("date")}
      </label>

      <label className="flex flex-col">
        Cuenta
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} {...fieldProps("account_id")}>
          <option value="">Elige una cuenta</option>
          {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {hint("account_id")}
      </label>

      {type === "transfer" ? (
        <label className="flex flex-col">
          Hacia la cuenta
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}
            {...fieldProps("to_account_id")}>
            <option value="">Elige la cuenta de destino</option>
            {accounts.data?.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {hint("to_account_id")}
        </label>
      ) : (
        <label className="flex flex-col">
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            {...fieldProps("category_id")}>
            <option value="">Elige una categoría</option>
            {kindCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {hint("category_id")}
        </label>
      )}

      <label className="flex flex-col">
        Descripción
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </label>

      {errors.length > 0 && (
        <div role="alert">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <FormError error={accounts.error ?? categories.error} />

      <div className="flex gap-2">
        <button type="submit" disabled={saving}>{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
```

`frontend/src/features/transactions/SaveFeedback.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { formatCOP, parseAmount } from "@/lib/money";
import { type BudgetStatus, type TransactionSaved, useCreateTransaction } from "./api";

function budgetMessage(status: BudgetStatus): string | null {
  const spent = formatCOP(status.spent);
  const budget = formatCOP(status.budget);
  if (status.level === "warning") {
    return `Llevas ${status.percent}% del presupuesto de ${status.category_name} (${spent} de ${budget}).`;
  }
  if (status.level === "exceeded") {
    return `Te pasaste del presupuesto de ${status.category_name}: ${spent} de ${budget}.`;
  }
  return null;
}

type Props = { result: TransactionSaved; onDone: () => void };

export function SaveFeedback({ result, onDone }: Props) {
  const create = useCreateTransaction();
  const suggestion = result.savings_suggestion;
  const [showSuggestion, setShowSuggestion] = useState(Boolean(suggestion));
  const [amountText, setAmountText] = useState(suggestion ? formatCOP(suggestion.amount).slice(1) : "");
  const [saved, setSaved] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const warning = result.budget_status ? budgetMessage(result.budget_status) : null;

  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!suggestion) return;
    const parsed = parseAmount(amountText);
    if (!parsed.ok) return setLocalError(parsed.error);
    setLocalError(null);
    try {
      await create.mutateAsync({
        type: "transfer",
        amount: parsed.value,
        date: suggestion.date,
        account_id: suggestion.from_account_id,
        to_account_id: suggestion.to_account_id,
        source: "savings_rule",
      });
      setSaved(parsed.value);
      setShowSuggestion(false);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <p role="status">Movimiento guardado</p>
      {warning && <p role="alert">{warning}</p>}
      {showSuggestion && suggestion && (
        <form onSubmit={accept} className="flex flex-col gap-2">
          <p>Págate primero: ¿apartas {formatCOP(suggestion.amount)} para tu ahorro?</p>
          <label className="flex flex-col">
            Monto a apartar
            <input inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </label>
          <FormError error={localError ?? create.error} />
          <div className="flex gap-2">
            <button type="submit" disabled={create.isPending}>Apartar</button>
            <button type="button" onClick={() => setShowSuggestion(false)}>Ahora no</button>
          </div>
        </form>
      )}
      {saved !== null && <p>Listo, apartaste {formatCOP(saved)}.</p>}
      <button type="button" onClick={onDone}>Listo</button>
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): transaction form with defaults and missing-field hints, save feedback"
```

---

### Task 10: Registro rápido por texto y voz (Web Speech → Claude → confirmación)

**Files:**
- Create: `frontend/src/features/quick-entry/speech.ts`, `frontend/src/features/quick-entry/api.ts`, `frontend/src/features/quick-entry/RegisterFlow.tsx`
- Create: `frontend/src/app/(app)/registrar/page.tsx`
- Test: `frontend/src/features/quick-entry/speech.test.ts`, `frontend/src/features/quick-entry/RegisterFlow.test.tsx`

**Interfaces:**
- Consumes: `TransactionForm`, `SaveFeedback`, `useCreateTransaction`, `ApiError`, `messageFor`, `FormError`.
- Produces:
  - `speech.ts`: `getRecognitionConstructor(): RecognitionConstructor | null` (usa `SpeechRecognition` o `webkitSpeechRecognition`), `transcriptOf(event): string`, `useSpeech(onText) -> { supported, listening, start, stop }` (`lang = "es-CO"`, resultados parciales; `supported` se calcula en `useEffect` para no romper la hidratación).
  - `quick-entry/api.ts`: `useParseTransaction()` → `POST /api/ai/parse-transaction` con `{ text }`, devuelve `DraftTransaction`.
  - `RegisterFlow` — pasos `entry` → `form` → `saved`:
    - `entry`: caja "Cuéntame el movimiento" (máx. 300), botón "Dictar"/"Detener" solo si hay Web Speech, "Interpretar" (deshabilitado con texto vacío), "Registrar a mano".
    - Éxito del parseo → `form` prellenado con `missingFields`; se guarda con `source: "voice"`.
    - `503` → `form` vacío con el aviso "No pude interpretarlo, complétalo a mano." y el texto original visible ("Dijiste: …"); `source: "manual"`.
    - `429` u otros errores → se queda en `entry` con alerta y el texto intacto.
    - "Cancelar" en el formulario vuelve a `entry` conservando el texto; "Listo" en `saved` vuelve a `entry` vacío.

- [ ] **Step 1: Tests que fallan**

`frontend/src/features/quick-entry/speech.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { getRecognitionConstructor, transcriptOf } from "./speech";

describe("speech", () => {
  it("returns null without Web Speech support", () => {
    expect(getRecognitionConstructor()).toBeNull();
  });

  it("finds the prefixed constructor", () => {
    class Fake {}
    vi.stubGlobal("webkitSpeechRecognition", Fake);
    expect(getRecognitionConstructor()).toBe(Fake);
  });

  it("joins partial results", () => {
    const event = {
      results: [
        { 0: { transcript: "almorcé " }, isFinal: true, length: 1 },
        { 0: { transcript: "35 mil" }, isFinal: false, length: 1 },
      ],
    };
    expect(transcriptOf(event)).toBe("almorcé 35 mil");
  });
});
```

`frontend/src/features/quick-entry/RegisterFlow.test.tsx`:
```tsx
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi, type Handler } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { RegisterFlow } from "./RegisterFlow";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [{ id: "c1", name: "Comida", kind: "expense", archived: false }];
const saved = {
  status: 201,
  body: {
    transaction: {
      id: "t1", type: "expense", amount: 35000, date: "2026-10-03", account_id: "a1",
      to_account_id: null, category_id: "c1", description: "Almuerzo", status: "confirmed",
      source: "voice", created_at: "2026-10-03T12:00:00Z", recurring_template_id: null,
    },
    budget_status: null,
    savings_suggestion: null,
  },
};

function setup(parse: Handler) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "POST /api/ai/parse-transaction": parse,
    "POST /api/transactions": () => saved,
  });
}

async function interpret(text: string) {
  await userEvent.type(screen.getByLabelText("Cuéntame el movimiento"), text);
  await userEvent.click(screen.getByRole("button", { name: "Interpretar" }));
}

describe("RegisterFlow", () => {
  it("disables Interpretar while the box is empty and hides Dictar without support", () => {
    setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    expect(screen.getByRole("button", { name: "Interpretar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Dictar" })).not.toBeInTheDocument();
  });

  it("fills the box from speech recognition", async () => {
    const instances: { onresult: ((e: unknown) => void) | null; lang: string }[] = [];
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() { instances.push(this); }
      stop() { this.onend?.(); }
    }
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    await userEvent.click(await screen.findByRole("button", { name: "Dictar" }));
    expect(instances[0].lang).toBe("es-CO");
    act(() => {
      instances[0].onresult?.({ results: [{ 0: { transcript: "almorcé 35 mil" }, isFinal: true, length: 1 }] });
    });
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
  });

  it("prefills the form from the draft and saves as voice", async () => {
    const { calls } = setup(() => ({
      body: {
        type: "expense", amount: 35000, date: "2026-10-03", account_id: null, to_account_id: null,
        category_id: "c1", description: "Almuerzo", missing_fields: ["account_id"], notes: [],
      },
    }));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByLabelText("Monto")).toHaveValue("35.000");
    expect(screen.getByLabelText("Cuenta")).toHaveAttribute("aria-invalid", "true");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Movimiento guardado")).toBeInTheDocument();
    const post = calls.find((c) => c.path === "/api/transactions" && c.method === "POST")!;
    expect(post.body).toMatchObject({ amount: 35000, category_id: "c1", account_id: "a1", source: "voice" });
  });

  it("falls back to an empty form and keeps the text when the AI is unavailable", async () => {
    setup(() => apiError(503, "AI_UNAVAILABLE"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByText("No pude interpretarlo, complétalo a mano.")).toBeInTheDocument();
    expect(screen.getByText("Dijiste: almorcé 35 mil")).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toHaveValue("");
  });

  it("stays on the text box when rate limited", async () => {
    setup(() => apiError(429, "AI_RATE_LIMITED"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    expect(await screen.findByRole("alert")).toHaveTextContent("Hiciste muchas solicitudes seguidas");
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
    expect(screen.queryByLabelText("Monto")).not.toBeInTheDocument();
  });

  it("cancel returns to the box with the text intact", async () => {
    setup(() => apiError(503, "AI_UNAVAILABLE"));
    renderWithClient(<RegisterFlow />);
    await interpret("almorcé 35 mil");
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("almorcé 35 mil");
  });

  it("manual entry saves with source manual and Listo resets", async () => {
    const { calls } = setup(() => ({ body: {} }));
    renderWithClient(<RegisterFlow />);
    await userEvent.click(screen.getByRole("button", { name: "Registrar a mano" }));
    await userEvent.type(await screen.findByLabelText("Monto"), "35000");
    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Listo" }));
    expect(screen.getByLabelText("Cuéntame el movimiento")).toHaveValue("");
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/transactions")!.body).toMatchObject({ source: "manual" }),
    );
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/features/quick-entry/speech.ts`:
```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { 0: RecognitionAlternative; isFinal: boolean; length: number };
export type RecognitionEvent = { results: ArrayLike<RecognitionResult> };

export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
export type RecognitionConstructor = new () => Recognition;

export function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, RecognitionConstructor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function transcriptOf(event: RecognitionEvent): string {
  return Array.from(event.results)
    .map((result) => result[0].transcript)
    .join("");
}

export function useSpeech(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(getRecognitionConstructor() !== null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "es-CO";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => onText(transcriptOf(event).slice(0, 300));
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }, [onText]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  return { supported, listening, start, stop };
}
```

`frontend/src/features/quick-entry/api.ts`:
```ts
import { useMutation } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type DraftTransaction = Schemas["DraftTransaction"];

export function useParseTransaction() {
  return useMutation({
    mutationFn: (text: string) => unwrap(api.POST("/api/ai/parse-transaction", { body: { text } })),
  });
}
```

`frontend/src/features/quick-entry/RegisterFlow.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type TransactionSaved, useCreateTransaction } from "@/features/transactions/api";
import { SaveFeedback } from "@/features/transactions/SaveFeedback";
import { TransactionForm, type TransactionFormValues } from "@/features/transactions/TransactionForm";
import { type DraftTransaction, useParseTransaction } from "./api";
import { useSpeech } from "./speech";

type Step =
  | { name: "entry"; error: unknown }
  | { name: "form"; draft: DraftTransaction | null; notice: string | null; source: "voice" | "manual" }
  | { name: "saved"; result: TransactionSaved };

export function RegisterFlow() {
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ name: "entry", error: null });
  const parse = useParseTransaction();
  const create = useCreateTransaction();
  const speech = useSpeech(setText);

  async function interpret(event: FormEvent) {
    event.preventDefault();
    try {
      const draft = await parse.mutateAsync(text.trim());
      setStep({ name: "form", draft, notice: null, source: "voice" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "AI_UNAVAILABLE") {
        setStep({ name: "form", draft: null, notice: messageFor(error), source: "manual" });
      } else {
        setStep({ name: "entry", error });
      }
    }
  }

  async function save(values: TransactionFormValues, source: "voice" | "manual") {
    const result = await create.mutateAsync({ ...values, source });
    setStep({ name: "saved", result });
  }

  if (step.name === "saved") {
    return (
      <SaveFeedback
        result={step.result}
        onDone={() => {
          setText("");
          setStep({ name: "entry", error: null });
        }}
      />
    );
  }

  if (step.name === "form") {
    const draft = step.draft;
    return (
      <div className="flex flex-col gap-3">
        {step.notice && <p>{step.notice}</p>}
        {text.trim() && <p>Dijiste: {text.trim()}</p>}
        <TransactionForm
          initial={draft ?? {}}
          missingFields={draft?.missing_fields ?? []}
          submitLabel="Guardar"
          onSubmit={(values) => save(values, step.source)}
          onCancel={() => setStep({ name: "entry", error: null })}
        />
      </div>
    );
  }

  return (
    <form onSubmit={interpret} className="flex flex-col gap-3">
      <label className="flex flex-col">
        Cuéntame el movimiento
        <textarea
          value={text}
          maxLength={300}
          rows={3}
          placeholder="almorcé 35 mil con la débito"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {speech.supported && (
          <button type="button" onClick={speech.listening ? speech.stop : speech.start}>
            {speech.listening ? "Detener" : "Dictar"}
          </button>
        )}
        <button type="submit" disabled={!text.trim() || parse.isPending}>
          {parse.isPending ? "Interpretando…" : "Interpretar"}
        </button>
        <button type="button" onClick={() => setStep({ name: "form", draft: null, notice: null, source: "manual" })}>
          Registrar a mano
        </button>
      </div>
      <FormError error={step.error} />
    </form>
  );
}
```

`frontend/src/app/(app)/registrar/page.tsx`:
```tsx
import { RegisterFlow } from "@/features/quick-entry/RegisterFlow";

export default function RegisterPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Registrar</h1>
      <RegisterFlow />
    </section>
  );
}
```

Nota: el botón "Interpretar" muestra "Interpretando…" mientras espera; el test lo busca por nombre "Interpretar" antes del clic, así que no afecta.

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): quick entry by text and voice with AI draft and confirmation"
```

---

### Task 11: Movimientos — lista por mes con filtros y paginación, edición, borrado y pendientes

**Files:**
- Create: `frontend/src/components/MonthPicker.tsx`
- Modify: `frontend/src/features/transactions/api.ts` (agrega `useTransactions`)
- Create: `frontend/src/features/transactions/TransactionList.tsx`, `frontend/src/features/transactions/PendingList.tsx`
- Create: `frontend/src/app/(app)/movimientos/page.tsx`
- Test: `frontend/src/components/MonthPicker.test.tsx`, `frontend/src/features/transactions/TransactionList.test.tsx`, `frontend/src/features/transactions/PendingList.test.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `useCategories`, `TransactionForm`, `SaveFeedback`, `useUpdateTransaction`, `useConfirmTransaction`, `useDeleteTransaction`, `ConfirmButton`, `formatCOP`, `currentMonth`, `addMonths`, `monthRange`, `monthLabel`, `shortDate`.
- Produces:
  - `MonthPicker({ month, onChange })` — botones "Mes anterior" / "Mes siguiente" y el texto `monthLabel(month)`.
  - `type TransactionFilters = { from?; to?; type?; category_id?; account_id?; status?: "confirmed" | "pending" }`; `useTransactions(filters)` — `useInfiniteQuery` con clave `["transactions", filters]`, `limit: 30`, cursor desde `next_cursor`.
  - `signedAmount(txn): string` — gasto `-$x`, ingreso `$x`, transferencia `$x`.
  - `TransactionList` (mes actual por defecto; filtros Tipo / Categoría / Cuenta; "Cargar más"; "Editar" en línea; "Borrar" con confirmación; vacío: "No hay movimientos en este mes.").
  - `PendingList` (sección "Por confirmar"; oculta si no hay; "Confirmar" abre el formulario prellenado y muestra `SaveFeedback`; "Descartar" con confirmación).

- [ ] **Step 1: Tests que fallan**

`frontend/src/components/MonthPicker.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthPicker } from "./MonthPicker";

describe("MonthPicker", () => {
  it("moves between months", async () => {
    const onChange = vi.fn();
    render(<MonthPicker month="2026-01" onChange={onChange} />);
    expect(screen.getByText("enero de 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(onChange).toHaveBeenLastCalledWith("2025-12");
    await userEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-02");
  });
});
```

`frontend/src/features/transactions/TransactionList.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addMonths, currentMonth, monthRange } from "@/lib/dates";
import { mockApi, type MockRequest } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { TransactionList, signedAmount } from "./TransactionList";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [{ id: "c1", name: "Comida", kind: "expense", archived: false }];
const base = {
  status: "confirmed", source: "manual", created_at: "2026-10-03T12:00:00Z",
  recurring_template_id: null, to_account_id: null,
};
const expense = { ...base, id: "t1", type: "expense", amount: 35000, date: "2026-10-03", account_id: "a1", category_id: "c1", description: "Almuerzo" };
const transfer = { ...base, id: "t2", type: "transfer", amount: 600000, date: "2026-10-02", account_id: "a1", to_account_id: "a2", category_id: null, description: null };

function setup(list: (req: MockRequest) => { status?: number; body?: unknown }, extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/transactions": list,
    ...extra,
  });
}

describe("signedAmount", () => {
  it("signs by type", () => {
    expect(signedAmount({ type: "expense", amount: 35000 })).toBe("-$35.000");
    expect(signedAmount({ type: "income", amount: 35000 })).toBe("$35.000");
    expect(signedAmount({ type: "transfer", amount: 600000 })).toBe("$600.000");
  });
});

describe("TransactionList", () => {
  it("lists confirmed movements of the current month", async () => {
    const { calls } = setup(() => ({ body: { items: [expense, transfer], next_cursor: null } }));
    renderWithClient(<TransactionList />);
    const row = (await screen.findByText("Almuerzo")).closest("li")!;
    expect(within(row).getByText("-$35.000")).toBeInTheDocument();
    expect(within(row).getByText(/Comida · Bancolombia/)).toBeInTheDocument();
    expect(screen.getByText(/Bancolombia → Ahorro/)).toBeInTheDocument();
    const query = calls.find((c) => c.path === "/api/transactions")!.url.searchParams;
    const range = monthRange(currentMonth());
    expect(query.get("from")).toBe(range.from);
    expect(query.get("to")).toBe(range.to);
    expect(query.get("status")).toBe("confirmed");
  });

  it("changes month and filters by type", async () => {
    const { calls } = setup(() => ({ body: { items: [], next_cursor: null } }));
    renderWithClient(<TransactionList />);
    expect(await screen.findByText("No hay movimientos en este mes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await waitFor(() =>
      expect(calls.at(-1)!.url.searchParams.get("from")).toBe(`${addMonths(currentMonth(), -1)}-01`),
    );
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "expense");
    await waitFor(() => expect(calls.at(-1)!.url.searchParams.get("type")).toBe("expense"));
  });

  it("loads more pages with the cursor", async () => {
    const { calls } = setup(({ url }) =>
      url.searchParams.get("cursor")
        ? { body: { items: [transfer], next_cursor: null } }
        : { body: { items: [expense], next_cursor: "CUR1" } },
    );
    renderWithClient(<TransactionList />);
    await userEvent.click(await screen.findByRole("button", { name: "Cargar más" }));
    expect(await screen.findByText(/Bancolombia → Ahorro/)).toBeInTheDocument();
    expect(calls.at(-1)!.url.searchParams.get("cursor")).toBe("CUR1");
    expect(screen.queryByRole("button", { name: "Cargar más" })).not.toBeInTheDocument();
  });

  it("edits and deletes a movement", async () => {
    const { calls } = setup(() => ({ body: { items: [expense], next_cursor: null } }), {
      "PATCH /api/transactions/t1": () => ({ body: { ...expense, amount: 40000 } }),
      "DELETE /api/transactions/t1": () => ({ status: 204 }),
    });
    renderWithClient(<TransactionList />);
    const row = (await screen.findByText("Almuerzo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Editar" }));
    const amount = within(row).getByLabelText("Monto");
    await userEvent.clear(amount);
    await userEvent.type(amount, "40.000");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ amount: 40000, category_id: "c1" }),
    );
    const again = (await screen.findByText("Almuerzo")).closest("li")!;
    await userEvent.click(within(again).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(again).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});
```

`frontend/src/features/transactions/PendingList.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { PendingList } from "./PendingList";

const accounts = [{ id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 }];
const categories = [{ id: "c1", name: "Vivienda", kind: "expense", archived: false }];
const pending = {
  id: "p1", type: "expense", amount: 1200000, date: "2026-10-15", account_id: "a1",
  to_account_id: null, category_id: "c1", description: "Arriendo", status: "pending",
  source: "recurring", created_at: "2026-10-15T11:00:00Z", recurring_template_id: "r1",
};

function setup(items: unknown[], extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/transactions": () => ({ body: { items, next_cursor: null } }),
    ...extra,
  });
}

describe("PendingList", () => {
  it("renders nothing without pending movements", async () => {
    const { calls } = setup([]);
    renderWithClient(<PendingList />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/transactions")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Por confirmar" })).not.toBeInTheDocument();
  });

  it("confirms a pending movement with edits", async () => {
    const { calls } = setup([pending], {
      "POST /api/transactions/p1/confirm": () => ({
        body: { transaction: { ...pending, status: "confirmed", amount: 1250000 }, budget_status: null, savings_suggestion: null },
      }),
    });
    renderWithClient(<PendingList />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    expect(calls.find((c) => c.path === "/api/transactions")!.url.searchParams.get("status")).toBe("pending");
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar" }));
    const amount = within(row).getByLabelText("Monto");
    expect(amount).toHaveValue("1.200.000");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1.250.000");
    await userEvent.click(within(row).getByRole("button", { name: "Confirmar movimiento" }));
    expect(await screen.findByText("Movimiento guardado")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ amount: 1250000 });
  });

  it("discards a pending movement", async () => {
    const { calls } = setup([pending], { "DELETE /api/transactions/p1": () => ({ status: 204 }) });
    renderWithClient(<PendingList />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Descartar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, descartar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/components/MonthPicker.tsx`:
```tsx
"use client";

import { addMonths, monthLabel } from "@/lib/dates";

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => onChange(addMonths(month, -1))}>Mes anterior</button>
      <span>{monthLabel(month)}</span>
      <button type="button" onClick={() => onChange(addMonths(month, 1))}>Mes siguiente</button>
    </div>
  );
}
```

Agrega a `frontend/src/features/transactions/api.ts` (importa `useInfiniteQuery`):
```ts
export type TransactionFilters = {
  from?: string;
  to?: string;
  type?: TransactionType;
  category_id?: string;
  account_id?: string;
  status?: "confirmed" | "pending";
};

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/api/transactions", {
        params: { query: { ...filters, limit: 30, cursor: pageParam ?? undefined } },
      })),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}
```

`frontend/src/features/transactions/TransactionList.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { currentMonth, monthRange, shortDate } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import {
  type Transaction, type TransactionType,
  useDeleteTransaction, useTransactions, useUpdateTransaction,
} from "./api";
import { TransactionForm } from "./TransactionForm";

export function signedAmount(txn: Pick<Transaction, "type" | "amount">): string {
  return txn.type === "expense" ? formatCOP(-txn.amount) : formatCOP(txn.amount);
}

export function useNames() {
  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const account = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name ?? "";
  const category = (id: string | null) => categories.data?.find((c) => c.id === id)?.name ?? "";
  return { account, category, accounts: accounts.data ?? [], categories: categories.data ?? [] };
}

export function describeTransaction(txn: Transaction, names: ReturnType<typeof useNames>) {
  const title = txn.description || (txn.type === "transfer" ? "Transferencia" : names.category(txn.category_id));
  const detail =
    txn.type === "transfer"
      ? `${names.account(txn.account_id)} → ${names.account(txn.to_account_id)}`
      : `${names.category(txn.category_id)} · ${names.account(txn.account_id)}`;
  return { title, detail };
}

function TransactionRow({ txn, names }: { txn: Transaction; names: ReturnType<typeof useNames> }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const { title, detail } = describeTransaction(txn, names);

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{title}</span>
        <span>{signedAmount(txn)}</span>
      </div>
      <span>{shortDate(txn.date)} · {detail}</span>
      {editing ? (
        <TransactionForm
          initial={txn}
          submitLabel="Guardar cambios"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await update.mutateAsync({ id: txn.id, ...values });
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)}>Editar</button>
          <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(txn.id)} />
        </div>
      )}
      <FormError error={remove.error} />
    </li>
  );
}

export function TransactionList() {
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState<TransactionType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const names = useNames();
  const range = monthRange(month);
  const list = useTransactions({
    from: range.from,
    to: range.to,
    status: "confirmed",
    type: type || undefined,
    category_id: categoryId || undefined,
    account_id: accountId || undefined,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="flex flex-col gap-3">
      <MonthPicker month={month} onChange={setMonth} />
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as TransactionType | "")}>
            <option value="">Todos</option>
            <option value="expense">Gastos</option>
            <option value="income">Ingresos</option>
            <option value="transfer">Transferencias</option>
          </select>
        </label>
        <label className="flex flex-col">
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {names.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          Cuenta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Todas</option>
            {names.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <FormError error={list.error} />
      {list.isSuccess && items.length === 0 && <p>No hay movimientos en este mes.</p>}
      <ul>{items.map((txn) => <TransactionRow key={txn.id} txn={txn} names={names} />)}</ul>
      {list.hasNextPage && (
        <button type="button" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          Cargar más
        </button>
      )}
    </section>
  );
}
```

Nota: el filtro "Categoría" de la lista y el campo "Categoría" del formulario de edición tienen el mismo label; el test de edición busca el campo `Monto` dentro de la fila (`within(row)`), así que no hay ambigüedad. Si `getByLabelText("Tipo")` resultara ambiguo en algún test por el `<legend>` del formulario, ese test ya lo resuelve buscando antes de abrir el formulario.

`frontend/src/features/transactions/PendingList.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { shortDate } from "@/lib/dates";
import {
  type Transaction, type TransactionSaved,
  useConfirmTransaction, useDeleteTransaction, useTransactions,
} from "./api";
import { SaveFeedback } from "./SaveFeedback";
import { TransactionForm } from "./TransactionForm";
import { describeTransaction, signedAmount, useNames } from "./TransactionList";

function PendingRow({ txn, names }: { txn: Transaction; names: ReturnType<typeof useNames> }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<TransactionSaved | null>(null);
  const confirm = useConfirmTransaction();
  const remove = useDeleteTransaction();
  const { title, detail } = describeTransaction(txn, names);

  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{title}</span>
        <span>{signedAmount(txn)}</span>
      </div>
      <span>{shortDate(txn.date)} · {detail}</span>
      {result ? (
        <SaveFeedback result={result} onDone={() => setResult(null)} />
      ) : confirming ? (
        <TransactionForm
          initial={txn}
          submitLabel="Confirmar movimiento"
          onCancel={() => setConfirming(false)}
          onSubmit={async (values) => {
            setResult(await confirm.mutateAsync({ id: txn.id, ...values }));
          }}
        />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming(true)}>Confirmar</button>
          <ConfirmButton label="Descartar" confirmLabel="Sí, descartar" onConfirm={() => remove.mutate(txn.id)} />
        </div>
      )}
      <FormError error={remove.error} />
    </li>
  );
}

export function PendingList() {
  const names = useNames();
  const list = useTransactions({ status: "pending" });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) return <FormError error={list.error} />;
  return (
    <section className="flex flex-col gap-2">
      <h2>Por confirmar</h2>
      <ul>{items.map((txn) => <PendingRow key={txn.id} txn={txn} names={names} />)}</ul>
    </section>
  );
}
```

Nota: al confirmar, `useInvalidateMoney` refresca la lista y el pendiente desaparece; `SaveFeedback` se muestra mientras la fila exista. Si en la práctica la fila se desmonta antes de que el usuario vea el aviso, mueve el estado `result` a `PendingList` y muestra `SaveFeedback` encima de la lista; anótalo en el reporte.

`frontend/src/app/(app)/movimientos/page.tsx`:
```tsx
import { PendingList } from "@/features/transactions/PendingList";
import { TransactionList } from "@/features/transactions/TransactionList";

export default function MovementsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Movimientos</h1>
      <PendingList />
      <TransactionList />
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): movements list with month filters, pagination, edit/delete and pending confirmation"
```

---

### Task 12: Dashboard mensual ("Inicio") y comparativo de meses

**Files:**
- Create: `frontend/src/features/dashboard/api.ts`, `MonthlySummary.tsx`, `CompareView.tsx`, `format.ts`
- Modify: `frontend/src/app/(app)/page.tsx`
- Create: `frontend/src/app/(app)/comparar/page.tsx`
- Test: `frontend/src/features/dashboard/MonthlySummary.test.tsx`, `CompareView.test.tsx`, `format.test.ts`

**Interfaces:**
- Consumes: `MonthPicker`, `formatCOP`, `currentMonth`, `monthLabel`, `FormError`.
- Produces:
  - `useMonthlySummary(month)` (clave `["dashboard", "monthly", month]`), `useCompare(months, until)` (clave `["dashboard", "compare", months, until]`).
  - `formatRate(rate: number | null): string` → `"16,7%"` o `"—"`; `formatDelta(pct: number | null): string` → `"+50,0%"`, `"-12,5%"`, `"nuevo"`.
  - `MonthlySummary` — cifras (Ingresos, Gastos, Ahorro, Balance, Tasa de ahorro), aviso de "págate primero", gasto por categoría con barra proporcional, presupuestos con límite, enlace a pendientes, saldos por cuenta.
  - `CompareView` — selector "Meses" (3, 6, 12), tabla por mes y variación por categoría.

- [ ] **Step 1: Tests que fallan**

`frontend/src/features/dashboard/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatDelta, formatRate } from "./format";

describe("dashboard format", () => {
  it("formats rates", () => {
    expect(formatRate(0.1667)).toBe("16,7%");
    expect(formatRate(-0.05)).toBe("-5,0%");
    expect(formatRate(null)).toBe("—");
  });

  it("formats deltas", () => {
    expect(formatDelta(50)).toBe("+50,0%");
    expect(formatDelta(-12.5)).toBe("-12,5%");
    expect(formatDelta(0)).toBe("0,0%");
    expect(formatDelta(null)).toBe("nuevo");
  });
});
```

`frontend/src/features/dashboard/MonthlySummary.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { addMonths, currentMonth } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { MonthlySummary } from "./MonthlySummary";

const summary = {
  month: "2026-10", income: 3000000, expense: 400000, savings: 500000, balance: 2600000,
  savings_rate: 0.1667,
  expense_by_category: [
    { category_id: "c1", name: "Comida", amount: 300000 },
    { category_id: "c2", name: "Transporte", amount: 100000 },
  ],
  budgets: [
    { category_id: "c1", category_name: "Comida", budget: 350000, spent: 300000, remaining: 50000, percent: 85, level: "warning", committed: 0 },
    { category_id: "c3", category_name: "Ocio", budget: 0, spent: 0, remaining: null, percent: null, level: "none", committed: 0 },
  ],
  pending: { count: 2, income: 0, expense: 95000 },
  accounts: [{ id: "a1", name: "Bancolombia", type: "debit", balance: 5000000 }],
  savings_reminder: true,
};

describe("MonthlySummary", () => {
  it("shows the month figures", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/monthly": () => ({ body: summary }) });
    renderWithClient(<MonthlySummary />);
    const figures = await screen.findByRole("region", { name: "Resumen del mes" });
    expect(within(figures).getByText("$3.000.000")).toBeInTheDocument();
    expect(within(figures).getByText("$400.000")).toBeInTheDocument();
    expect(within(figures).getByText("$500.000")).toBeInTheDocument();
    expect(within(figures).getByText("$2.600.000")).toBeInTheDocument();
    expect(within(figures).getByText("16,7%")).toBeInTheDocument();
    expect(calls[0].url.searchParams.get("month")).toBe(currentMonth());
  });

  it("shows reminder, categories, budgets with limits, pending and balances", async () => {
    mockApi({ "GET /api/dashboard/monthly": () => ({ body: summary }) });
    renderWithClient(<MonthlySummary />);
    expect(await screen.findByText(/aún no apartaste tu ahorro/)).toBeInTheDocument();
    const categories = screen.getByRole("region", { name: "Gasto por categoría" });
    expect(within(categories).getByText("Comida")).toBeInTheDocument();
    const budgets = screen.getByRole("region", { name: "Presupuestos" });
    expect(within(budgets).getByText("Comida: $300.000 de $350.000 (85%)")).toBeInTheDocument();
    expect(within(budgets).queryByText(/Ocio/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 movimientos por confirmar" })).toHaveAttribute("href", "/movimientos");
    expect(within(screen.getByRole("region", { name: "Cuentas" })).getByText("$5.000.000")).toBeInTheDocument();
  });

  it("navigates months", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/monthly": () => ({ body: { ...summary, savings_rate: null } }) });
    renderWithClient(<MonthlySummary />);
    expect(await screen.findByText("—")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    await waitFor(() =>
      expect(calls.at(-1)!.url.searchParams.get("month")).toBe(addMonths(currentMonth(), -1)),
    );
  });
});
```

`frontend/src/features/dashboard/CompareView.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { CompareView } from "./CompareView";

const body = {
  months: [
    { month: "2026-09", income: 3000000, expense: 200000, savings: 0 },
    { month: "2026-10", income: 3000000, expense: 400000, savings: 500000 },
  ],
  categories: [
    { category_id: "c1", name: "Comida", current: 300000, previous: 200000, delta: 100000, delta_pct: 50 },
    { category_id: "c2", name: "Transporte", current: 100000, previous: 0, delta: 100000, delta_pct: null },
  ],
};

describe("CompareView", () => {
  it("renders months and category changes", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/compare": () => ({ body }) });
    renderWithClient(<CompareView />);
    expect(await screen.findByRole("row", { name: /octubre de 2026/ })).toHaveTextContent("$400.000");
    expect(screen.getByText(/Comida: \$300\.000 \(\+50,0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Transporte: \$100\.000 \(nuevo\)/)).toBeInTheDocument();
    expect(calls[0].url.searchParams.get("months")).toBe("6");
  });

  it("changes the number of months", async () => {
    const { calls } = mockApi({ "GET /api/dashboard/compare": () => ({ body }) });
    renderWithClient(<CompareView />);
    await screen.findByRole("row", { name: /octubre de 2026/ });
    await userEvent.selectOptions(screen.getByLabelText("Meses"), "12");
    await waitFor(() => expect(calls.at(-1)!.url.searchParams.get("months")).toBe("12"));
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/features/dashboard/format.ts`:
```ts
function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${decimal(rate * 100)}%`;
}

export function formatDelta(pct: number | null): string {
  if (pct === null) return "nuevo";
  return `${pct > 0 ? "+" : ""}${decimal(pct)}%`;
}
```

`frontend/src/features/dashboard/api.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type MonthlySummaryData = Schemas["MonthlySummary"];
export type CompareData = Schemas["CompareOut"];

export function useMonthlySummary(month: string) {
  return useQuery({
    queryKey: ["dashboard", "monthly", month],
    queryFn: () => unwrap(api.GET("/api/dashboard/monthly", { params: { query: { month } } })),
  });
}

export function useCompare(months: number, until: string) {
  return useQuery({
    queryKey: ["dashboard", "compare", months, until],
    queryFn: () =>
      unwrap(api.GET("/api/dashboard/compare", { params: { query: { months, until } } })),
  });
}
```

`frontend/src/features/dashboard/MonthlySummary.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { useMonthlySummary } from "./api";
import { formatRate } from "./format";

export function MonthlySummary() {
  const [month, setMonth] = useState(currentMonth());
  const summary = useMonthlySummary(month);
  const data = summary.data;
  const maxCategory = Math.max(1, ...(data?.expense_by_category.map((c) => c.amount) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <MonthPicker month={month} onChange={setMonth} />
      <FormError error={summary.error} />
      {data && (
        <>
          <section aria-label="Resumen del mes">
            <dl className="grid grid-cols-2 gap-2">
              <dt>Ingresos</dt><dd>{formatCOP(data.income)}</dd>
              <dt>Gastos</dt><dd>{formatCOP(data.expense)}</dd>
              <dt>Ahorro</dt><dd>{formatCOP(data.savings)}</dd>
              <dt>Balance</dt><dd>{formatCOP(data.balance)}</dd>
              <dt>Tasa de ahorro</dt><dd>{formatRate(data.savings_rate)}</dd>
            </dl>
          </section>

          {data.savings_reminder && (
            <p role="note">
              Recibiste tu salario y aún no apartaste tu ahorro. <Link href="/registrar">Registrar ahorro</Link>
            </p>
          )}

          {data.pending.count > 0 && (
            <Link href="/movimientos">
              {data.pending.count === 1 ? "1 movimiento por confirmar" : `${data.pending.count} movimientos por confirmar`}
            </Link>
          )}

          <section aria-label="Gasto por categoría">
            <h2>Gasto por categoría</h2>
            <ul>
              {data.expense_by_category.map((c) => (
                <li key={c.category_id} className="flex flex-col">
                  <span className="flex justify-between"><span>{c.name}</span><span>{formatCOP(c.amount)}</span></span>
                  <span aria-hidden className="block h-1 bg-current" style={{ width: `${(c.amount / maxCategory) * 100}%` }} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Presupuestos">
            <h2>Presupuestos</h2>
            <ul>
              {data.budgets.filter((b) => b.level !== "none").map((b) => (
                <li key={b.category_id} data-level={b.level}>
                  {`${b.category_name}: ${formatCOP(b.spent)} de ${formatCOP(b.budget)} (${b.percent}%)`}
                </li>
              ))}
            </ul>
            <Link href="/presupuestos">Ver presupuestos</Link>
          </section>

          <section aria-label="Cuentas">
            <h2>Cuentas</h2>
            <ul>
              {data.accounts.map((a) => (
                <li key={a.id} className="flex justify-between"><span>{a.name}</span><span>{formatCOP(a.balance)}</span></li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
```

`frontend/src/features/dashboard/CompareView.tsx`:
```tsx
"use client";

import { useState } from "react";
import { FormError } from "@/components/FormError";
import { currentMonth, monthLabel } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { useCompare } from "./api";
import { formatDelta } from "./format";

export function CompareView() {
  const [months, setMonths] = useState(6);
  const compare = useCompare(months, currentMonth());
  const data = compare.data;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col">
        Meses
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          <option value={3}>3</option>
          <option value={6}>6</option>
          <option value={12}>12</option>
        </select>
      </label>
      <FormError error={compare.error} />
      {data && (
        <>
          <table>
            <thead>
              <tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Ahorro</th></tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td>{formatCOP(m.income)}</td>
                  <td>{formatCOP(m.expense)}</td>
                  <td>{formatCOP(m.savings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <section aria-label="Cambios por categoría">
            <h2>Frente al mes anterior</h2>
            <ul>
              {data.categories.map((c) => (
                <li key={c.category_id}>{`${c.name}: ${formatCOP(c.current)} (${formatDelta(c.delta_pct)})`}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
```

`frontend/src/app/(app)/page.tsx`:
```tsx
import { MonthlySummary } from "@/features/dashboard/MonthlySummary";

export default function HomePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Inicio</h1>
      <MonthlySummary />
    </section>
  );
}
```

`frontend/src/app/(app)/comparar/page.tsx`:
```tsx
import { CompareView } from "@/features/dashboard/CompareView";

export default function ComparePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Comparar meses</h1>
      <CompareView />
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): monthly dashboard and month comparison"
```

---

### Task 13: Presupuestos

**Files:**
- Create: `frontend/src/features/budgets/api.ts`, `frontend/src/features/budgets/BudgetsPanel.tsx`
- Create: `frontend/src/app/(app)/presupuestos/page.tsx`
- Test: `frontend/src/features/budgets/BudgetsPanel.test.tsx`

**Interfaces:**
- Consumes: `MonthPicker`, `formatCOP`, `parseAmount`, `currentMonth`, `FormError`.
- Produces:
  - `useBudgetStatus(month)` (clave `["budgets", month]`), `useSetBudget()` (PUT; invalida `["budgets"]` y `["dashboard"]`).
  - `LEVEL_LABELS` = `none` "Sin presupuesto", `ok` "Vas bien", `warning` "Cerca del límite", `exceeded` "Te pasaste".
  - `BudgetsPanel` — por categoría: gastado vs presupuesto, nivel, "Comprometido" si hay pendientes, y campo "Presupuesto de <categoría>" + "Guardar" (vacío o `0` = quitar presupuesto). Texto fijo: "El presupuesto aplica desde este mes en adelante."

- [ ] **Step 1: Test que falla**

`frontend/src/features/budgets/BudgetsPanel.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { currentMonth } from "@/lib/dates";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { BudgetsPanel } from "./BudgetsPanel";

const items = [
  { category_id: "c1", category_name: "Comida", budget: 100000, spent: 85000, remaining: 15000, percent: 85, level: "warning", committed: 40000 },
  { category_id: "c2", category_name: "Ocio", budget: 0, spent: 20000, remaining: null, percent: null, level: "none", committed: 0 },
];

function setup() {
  return mockApi({
    "GET /api/budgets/status": () => ({ body: { month: currentMonth(), items } }),
    "PUT /api/budgets": ({ body }) => ({ body }),
  });
}

describe("BudgetsPanel", () => {
  it("shows the status of each category", async () => {
    setup();
    renderWithClient(<BudgetsPanel />);
    const comida = (await screen.findByText("Comida")).closest("li")!;
    expect(within(comida).getByText("$85.000 de $100.000")).toBeInTheDocument();
    expect(within(comida).getByText("Cerca del límite")).toBeInTheDocument();
    expect(within(comida).getByText("Comprometido: $40.000")).toBeInTheDocument();
    const ocio = screen.getByText("Ocio").closest("li")!;
    expect(within(ocio).getByText("Sin presupuesto")).toBeInTheDocument();
    expect(within(ocio).getByText("Gastado: $20.000")).toBeInTheDocument();
  });

  it("saves a budget for the selected month", async () => {
    const { calls } = setup();
    renderWithClient(<BudgetsPanel />);
    const input = await screen.findByLabelText("Presupuesto de Ocio");
    await userEvent.type(input, "150.000");
    await userEvent.click(within(input.closest("li")!).getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
        category_id: "c2", month: currentMonth(), amount: 150000,
      }),
    );
  });

  it("removes a budget with 0 and rejects invalid amounts", async () => {
    const { calls } = setup();
    renderWithClient(<BudgetsPanel />);
    const input = await screen.findByLabelText("Presupuesto de Comida");
    expect(input).toHaveValue("100.000");
    await userEvent.clear(input);
    await userEvent.type(input, "1,5");
    const row = input.closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    expect(await within(row).findByRole("alert")).toHaveTextContent("Usa solo pesos enteros");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ amount: 0 }));
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/features/budgets/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type BudgetStatusItem = Schemas["BudgetStatusItem"];

export function useBudgetStatus(month: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => unwrap(api.GET("/api/budgets/status", { params: { query: { month } } })),
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["BudgetSet"]) => unwrap(api.PUT("/api/budgets", { body })),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["budgets"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]),
  });
}
```

`frontend/src/features/budgets/BudgetsPanel.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/FormError";
import { MonthPicker } from "@/components/MonthPicker";
import { currentMonth } from "@/lib/dates";
import { formatCOP, parseAmount } from "@/lib/money";
import { type BudgetStatusItem, useBudgetStatus, useSetBudget } from "./api";

export const LEVEL_LABELS: Record<BudgetStatusItem["level"], string> = {
  none: "Sin presupuesto",
  ok: "Vas bien",
  warning: "Cerca del límite",
  exceeded: "Te pasaste",
};

function BudgetRow({ item, month }: { item: BudgetStatusItem; month: string }) {
  const setBudget = useSetBudget();
  const [text, setText] = useState(item.budget > 0 ? formatCOP(item.budget).slice(1) : "");
  const [localError, setLocalError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    let amount = 0;
    if (text.trim() !== "" && text.trim() !== "0") {
      const parsed = parseAmount(text);
      if (!parsed.ok) return setLocalError(parsed.error);
      amount = parsed.value;
    }
    setLocalError(null);
    await setBudget.mutateAsync({ category_id: item.category_id, month, amount }).catch(() => undefined);
  }

  return (
    <li className="flex flex-col gap-1 border-b py-2" data-level={item.level}>
      <span>{item.category_name}</span>
      <span>
        {item.level === "none" ? `Gastado: ${formatCOP(item.spent)}` : `${formatCOP(item.spent)} de ${formatCOP(item.budget)}`}
      </span>
      <span>{LEVEL_LABELS[item.level]}</span>
      {item.committed > 0 && <span>Comprometido: {formatCOP(item.committed)}</span>}
      <form onSubmit={save} className="flex gap-2">
        <label className="flex flex-col">
          Presupuesto de {item.category_name}
          <input inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={setBudget.isPending}>Guardar</button>
      </form>
      <FormError error={localError ?? setBudget.error} />
    </li>
  );
}

export function BudgetsPanel() {
  const [month, setMonth] = useState(currentMonth());
  const status = useBudgetStatus(month);
  return (
    <div className="flex flex-col gap-3">
      <MonthPicker month={month} onChange={setMonth} />
      <p>El presupuesto aplica desde este mes en adelante.</p>
      <FormError error={status.error} />
      <ul>
        {status.data?.items.map((item) => (
          <BudgetRow key={`${month}-${item.category_id}`} item={item} month={month} />
        ))}
      </ul>
    </div>
  );
}
```

`frontend/src/app/(app)/presupuestos/page.tsx`:
```tsx
import { BudgetsPanel } from "@/features/budgets/BudgetsPanel";

export default function BudgetsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Presupuestos</h1>
      <BudgetsPanel />
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): budgets per category and month"
```

---

### Task 14: Recurrentes y regla "págate primero"

**Files:**
- Create: `frontend/src/features/recurring/api.ts`, `frontend/src/features/recurring/RecurringManager.tsx`
- Create: `frontend/src/features/savings/api.ts`, `frontend/src/features/savings/SavingsRuleForm.tsx`
- Create: `frontend/src/app/(app)/mas/recurrentes/page.tsx`, `frontend/src/app/(app)/mas/ahorro/page.tsx`
- Test: `frontend/src/features/recurring/RecurringManager.test.tsx`, `frontend/src/features/savings/SavingsRuleForm.test.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `useCategories`, `ConfirmButton`, `FormError`, `formatCOP`, `parseAmount`, `todayISO`, `shortDate`, `signedAmount`.
- Produces:
  - `recurring/api.ts`: `useRecurring()` (clave `["recurring"]`), `useCreateRecurring()`, `useUpdateRecurring()` (`{ id, ...RecurringUpdate }`), `useDeleteRecurring()`; invalidan `["recurring"]`.
  - `RecurringManager` — lista (título, monto con signo, "Día N de cada mes", "Próximo: <fecha>", "Pausada" si inactiva), botones "Pausar"/"Reanudar" y "Borrar"; formulario "Nueva plantilla" con Tipo, Monto, Cuenta, Hacia la cuenta (transferencia), Categoría, Descripción, "Día del mes", "Desde" (hoy por defecto) y "Hasta (opcional)".
  - `savings/api.ts`: `useSavingsRule()` (clave `["savings-rule"]`), `usePutSavingsRule()`, `useDeleteSavingsRule()`.
  - `SavingsRuleForm` — "Modo" (Porcentaje / Monto fijo), "Valor", "Cuando entre dinero en" (categorías de ingreso), "Apartar en la cuenta" (cuentas de tipo ahorro), "Activa"; "Guardar regla" → "Regla guardada"; "Quitar regla" con confirmación. Sin cuentas de ahorro muestra "Primero crea una cuenta de tipo Ahorro." con enlace a `/mas/cuentas`.

- [ ] **Step 1: Tests que fallan**

`frontend/src/features/recurring/RecurringManager.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
import { apiError, mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { RecurringManager } from "./RecurringManager";

const accounts = [{ id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 }];
const categories = [{ id: "c1", name: "Vivienda", kind: "expense", archived: false }];
const template = {
  id: "r1", type: "expense", amount: 1200000, account_id: "a1", to_account_id: null, category_id: "c1",
  description: "Arriendo", day_of_month: 5, start_date: "2026-10-01", end_date: null,
  next_run_date: "2026-11-05", active: true,
};

function setup(extra = {}) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accounts }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/recurring": () => ({ body: [template] }),
    ...extra,
  });
}

describe("RecurringManager", () => {
  it("lists templates", async () => {
    setup();
    renderWithClient(<RecurringManager />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    expect(within(row).getByText("-$1.200.000")).toBeInTheDocument();
    expect(within(row).getByText("Día 5 de cada mes · Próximo: 5 nov")).toBeInTheDocument();
  });

  it("pauses and deletes", async () => {
    const { calls } = setup({
      "PATCH /api/recurring/r1": () => ({ body: { ...template, active: false } }),
      "DELETE /api/recurring/r1": () => ({ status: 204 }),
    });
    renderWithClient(<RecurringManager />);
    const row = (await screen.findByText("Arriendo")).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ active: false }));
    await userEvent.click(within(row).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(row).getByRole("button", { name: "Sí, borrar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("creates a template", async () => {
    const { calls } = setup({ "POST /api/recurring": () => ({ status: 201, body: template }) });
    renderWithClient(<RecurringManager />);
    const form = await screen.findByRole("form", { name: "Nueva plantilla" });
    await userEvent.type(within(form).getByLabelText("Monto"), "1.200.000");
    await userEvent.selectOptions(within(form).getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(within(form).getByLabelText("Categoría"), "c1");
    await userEvent.type(within(form).getByLabelText("Descripción"), "Arriendo");
    await userEvent.clear(within(form).getByLabelText("Día del mes"));
    await userEvent.type(within(form).getByLabelText("Día del mes"), "5");
    expect(within(form).getByLabelText("Desde")).toHaveValue(todayISO());
    await userEvent.click(within(form).getByRole("button", { name: "Agregar plantilla" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")!.body).toEqual({
        type: "expense", amount: 1200000, account_id: "a1", to_account_id: null, category_id: "c1",
        description: "Arriendo", day_of_month: 5, start_date: todayISO(), end_date: null,
      }),
    );
  });

  it("shows server errors and keeps the form", async () => {
    setup({ "POST /api/recurring": () => apiError(422, "START_DATE_TOO_OLD") });
    renderWithClient(<RecurringManager />);
    const form = await screen.findByRole("form", { name: "Nueva plantilla" });
    await userEvent.type(within(form).getByLabelText("Monto"), "1000");
    await userEvent.selectOptions(within(form).getByLabelText("Cuenta"), "a1");
    await userEvent.selectOptions(within(form).getByLabelText("Categoría"), "c1");
    await userEvent.click(within(form).getByRole("button", { name: "Agregar plantilla" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("más de un año");
    expect(within(form).getByLabelText("Monto")).toHaveValue("1000");
  });
});
```

`frontend/src/features/savings/SavingsRuleForm.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi } from "@/test/fetch-mock";
import { renderWithClient } from "@/test/render";
import { SavingsRuleForm } from "./SavingsRuleForm";

const accounts = [
  { id: "a1", name: "Bancolombia", type: "debit", initial_balance: 0, archived: false, balance: 0 },
  { id: "a2", name: "Ahorro", type: "savings", initial_balance: 0, archived: false, balance: 0 },
];
const categories = [
  { id: "c1", name: "Comida", kind: "expense", archived: false },
  { id: "c2", name: "Salario", kind: "income", archived: false },
];
const rule = { mode: "percent", value: 20, trigger_category_id: "c2", target_account_id: "a2", active: true };

function setup(current: unknown, accountList = accounts) {
  return mockApi({
    "GET /api/accounts": () => ({ body: accountList }),
    "GET /api/categories": () => ({ body: categories }),
    "GET /api/savings-rule": () => ({ body: current }),
    "PUT /api/savings-rule": ({ body }) => ({ body }),
    "DELETE /api/savings-rule": () => ({ status: 204 }),
  });
}

describe("SavingsRuleForm", () => {
  it("prefills the existing rule", async () => {
    setup(rule);
    renderWithClient(<SavingsRuleForm />);
    await waitFor(() => expect(screen.getByLabelText("Valor")).toHaveValue("20"));
    expect(screen.getByLabelText("Modo")).toHaveValue("percent");
    expect(screen.getByLabelText("Cuando entre dinero en")).toHaveValue("c2");
    expect(screen.getByLabelText("Apartar en la cuenta")).toHaveValue("a2");
    expect(screen.queryByRole("option", { name: "Comida" })).not.toBeInTheDocument();
  });

  it("saves a fixed-amount rule", async () => {
    const { calls } = setup(null);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.selectOptions(await screen.findByLabelText("Modo"), "fixed");
    await userEvent.type(screen.getByLabelText("Valor"), "500.000");
    await userEvent.selectOptions(screen.getByLabelText("Cuando entre dinero en"), "c2");
    await userEvent.selectOptions(screen.getByLabelText("Apartar en la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar regla" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Regla guardada");
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      mode: "fixed", value: 500000, trigger_category_id: "c2", target_account_id: "a2", active: true,
    });
  });

  it("validates the percentage", async () => {
    const { calls } = setup(null);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.type(await screen.findByLabelText("Valor"), "101");
    await userEvent.selectOptions(screen.getByLabelText("Cuando entre dinero en"), "c2");
    await userEvent.selectOptions(screen.getByLabelText("Apartar en la cuenta"), "a2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar regla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("entre 1 y 100");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("asks for a savings account first", async () => {
    setup(null, [accounts[0]]);
    renderWithClient(<SavingsRuleForm />);
    expect(await screen.findByText("Primero crea una cuenta de tipo Ahorro.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a cuentas" })).toHaveAttribute("href", "/mas/cuentas");
  });

  it("removes the rule", async () => {
    const { calls } = setup(rule);
    renderWithClient(<SavingsRuleForm />);
    await userEvent.click(await screen.findByRole("button", { name: "Quitar regla" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/features/recurring/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type RecurringTemplate = Schemas["RecurringOut"];

export function useRecurring() {
  return useQuery({ queryKey: ["recurring"], queryFn: () => unwrap(api.GET("/api/recurring")) });
}

function useInvalidateRecurring() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["recurring"] });
}

export function useCreateRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (body: Schemas["RecurringCreate"]) => unwrap(api.POST("/api/recurring", { body })),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["RecurringUpdate"] & { id: string }) =>
      unwrap(api.PATCH("/api/recurring/{template_id}", { params: { path: { template_id: id } }, body })),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  const invalidate = useInvalidateRecurring();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/recurring/{template_id}", { params: { path: { template_id: id } } })),
    onSuccess: invalidate,
  });
}
```

`frontend/src/features/recurring/RecurringManager.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import type { TransactionType } from "@/features/transactions/api";
import { signedAmount } from "@/features/transactions/TransactionList";
import { shortDate, todayISO } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import {
  type RecurringTemplate,
  useCreateRecurring, useDeleteRecurring, useRecurring, useUpdateRecurring,
} from "./api";

function TemplateRow({ template, title }: { template: RecurringTemplate; title: string }) {
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  return (
    <li className="flex flex-col gap-1 border-b py-2">
      <div className="flex justify-between gap-2">
        <span>{title}</span>
        <span>{signedAmount(template)}</span>
      </div>
      <span>{`Día ${template.day_of_month} de cada mes · Próximo: ${shortDate(template.next_run_date)}`}</span>
      {!template.active && <span>Pausada</span>}
      <div className="flex gap-2">
        <button type="button" onClick={() => update.mutate({ id: template.id, active: !template.active })}>
          {template.active ? "Pausar" : "Reanudar"}
        </button>
        <ConfirmButton label="Borrar" onConfirm={() => remove.mutate(template.id)} />
      </div>
      <FormError error={update.error ?? remove.error} />
    </li>
  );
}

function NewTemplateForm() {
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateRecurring();
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [day, setDay] = useState("1");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseAmount(amount);
    const dayNumber = Number(day);
    if (!parsed.ok) return setLocalError(parsed.error);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return setLocalError("El día debe estar entre 1 y 31");
    if (!accountId) return setLocalError("Elige una cuenta");
    if (type === "transfer" && !toAccountId) return setLocalError("Elige la cuenta de destino");
    if (type !== "transfer" && !categoryId) return setLocalError("Elige una categoría");
    setLocalError(null);
    try {
      await create.mutateAsync({
        type,
        amount: parsed.value,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        description: description.trim() || null,
        day_of_month: dayNumber,
        start_date: startDate,
        end_date: endDate || null,
      });
      setAmount("");
      setDescription("");
    } catch {
      // Error visible abajo; se conservan los valores.
    }
  }

  return (
    <form aria-label="Nueva plantilla" onSubmit={onSubmit} className="flex flex-col gap-2">
      <h2>Nueva plantilla</h2>
      <label className="flex flex-col">
        Tipo
        <select value={type} onChange={(e) => { setType(e.target.value as TransactionType); setCategoryId(""); }}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
          <option value="transfer">Transferencia</option>
        </select>
      </label>
      <label className="flex flex-col">
        Monto
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Cuenta
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {type === "transfer" ? (
        <label className="flex flex-col">
          Hacia la cuenta
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Elige la cuenta de destino</option>
            {accounts.data?.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col">
          Categoría
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Elige una categoría</option>
            {categories.data?.filter((c) => c.kind === type).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col">
        Descripción
        <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Día del mes
        <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Desde
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Hasta (opcional)
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <FormError error={localError ?? create.error} />
      <button type="submit" disabled={create.isPending}>Agregar plantilla</button>
    </form>
  );
}

export function RecurringManager() {
  const templates = useRecurring();
  const categories = useCategories(true);
  const titleOf = (t: RecurringTemplate) =>
    t.description ||
    (t.type === "transfer" ? "Transferencia" : categories.data?.find((c) => c.id === t.category_id)?.name) ||
    "Recurrente";

  return (
    <div className="flex flex-col gap-4">
      <FormError error={templates.error} />
      <ul>{templates.data?.map((t) => <TemplateRow key={t.id} template={t} title={titleOf(t)} />)}</ul>
      <NewTemplateForm />
    </div>
  );
}
```

`frontend/src/features/savings/api.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Schemas } from "@/lib/api/client";
import { unwrap } from "@/lib/api/errors";

export type SavingsRule = Schemas["SavingsRuleOut"];

export function useSavingsRule() {
  return useQuery({ queryKey: ["savings-rule"], queryFn: () => unwrap(api.GET("/api/savings-rule")) });
}

export function usePutSavingsRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["SavingsRuleIn"]) => unwrap(api.PUT("/api/savings-rule", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule"] }),
  });
}

export function useDeleteSavingsRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/savings-rule")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savings-rule"] }),
  });
}
```

`frontend/src/features/savings/SavingsRuleForm.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormError } from "@/components/FormError";
import { useAccounts } from "@/features/accounts/api";
import { useCategories } from "@/features/categories/api";
import { formatCOP, parseAmount } from "@/lib/money";
import { useDeleteSavingsRule, usePutSavingsRule, useSavingsRule } from "./api";

type Mode = "percent" | "fixed";

export function SavingsRuleForm() {
  const rule = useSavingsRule();
  const accounts = useAccounts();
  const categories = useCategories();
  const put = usePutSavingsRule();
  const remove = useDeleteSavingsRule();
  const [mode, setMode] = useState<Mode>("percent");
  const [value, setValue] = useState("");
  const [triggerId, setTriggerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [active, setActive] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = rule.data;
    if (!current) return;
    setMode(current.mode);
    setValue(current.mode === "percent" ? String(current.value) : formatCOP(current.value).slice(1));
    setTriggerId(current.trigger_category_id);
    setTargetId(current.target_account_id);
    setActive(current.active);
  }, [rule.data]);

  const savingsAccounts = (accounts.data ?? []).filter((a) => a.type === "savings");
  const incomeCategories = (categories.data ?? []).filter((c) => c.kind === "income");

  if (accounts.isSuccess && savingsAccounts.length === 0) {
    return (
      <p>
        Primero crea una cuenta de tipo Ahorro. <Link href="/mas/cuentas">Ir a cuentas</Link>
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    let numeric: number;
    if (mode === "percent") {
      numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
        return setLocalError("El porcentaje debe estar entre 1 y 100");
      }
    } else {
      const parsed = parseAmount(value);
      if (!parsed.ok) return setLocalError(parsed.error);
      numeric = parsed.value;
    }
    if (!triggerId) return setLocalError("Elige la categoría de ingreso");
    if (!targetId) return setLocalError("Elige la cuenta de ahorro");
    setLocalError(null);
    try {
      await put.mutateAsync({ mode, value: numeric, trigger_category_id: triggerId, target_account_id: targetId, active });
      setSaved(true);
    } catch {
      // Error visible abajo.
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p>Cuando recibas un ingreso de esta categoría, te propondré apartar ahorro de inmediato.</p>
      <label className="flex flex-col">
        Modo
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="percent">Porcentaje</option>
          <option value="fixed">Monto fijo</option>
        </select>
      </label>
      <label className="flex flex-col">
        Valor
        <input inputMode="numeric" placeholder={mode === "percent" ? "20" : "500.000"} value={value}
          onChange={(e) => setValue(e.target.value)} />
      </label>
      <label className="flex flex-col">
        Cuando entre dinero en
        <select value={triggerId} onChange={(e) => setTriggerId(e.target.value)}>
          <option value="">Elige una categoría</option>
          {incomeCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col">
        Apartar en la cuenta
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Elige una cuenta</option>
          {savingsAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Activa
      </label>
      <FormError error={localError ?? put.error ?? remove.error ?? rule.error} />
      {saved && <p role="status">Regla guardada</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={put.isPending}>Guardar regla</button>
        {rule.data && (
          <ConfirmButton label="Quitar regla" confirmLabel="Sí, quitar" onConfirm={() => remove.mutate()} />
        )}
      </div>
    </form>
  );
}
```

`frontend/src/app/(app)/mas/recurrentes/page.tsx`:
```tsx
import { RecurringManager } from "@/features/recurring/RecurringManager";

export default function RecurringPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Recurrentes</h1>
      <RecurringManager />
    </section>
  );
}
```

`frontend/src/app/(app)/mas/ahorro/page.tsx`:
```tsx
import { SavingsRuleForm } from "@/features/savings/SavingsRuleForm";

export default function SavingsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1>Págate primero</h1>
      <SavingsRuleForm />
    </section>
  );
}
```

- [ ] **Step 3: Ver que pasan**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): recurring templates and pay-yourself-first rule"
```

---

### Task 15: PWA instalable (manifest y viewport)

**Files:**
- Create: `frontend/src/app/manifest.ts`, `frontend/public/icon.svg`
- Modify: `frontend/src/app/layout.tsx` (export `viewport`)
- Test: `frontend/src/app/manifest.test.ts`

**Interfaces:**
- Produces: manifest con `name: "Finanzas"`, `short_name: "Finanzas"`, `lang: "es-CO"`, `start_url: "/"`, `display: "standalone"`, `background_color` y `theme_color` `#ffffff` (impeccable los cambiará), icono `/icon.svg` (`sizes: "any"`, `purpose: "any"`); `viewport` con `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, `themeColor: "#ffffff"`.

- [ ] **Step 1: Test que falla**

`frontend/src/app/manifest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("describes an installable standalone app", () => {
    const m = manifest();
    expect(m).toMatchObject({
      name: "Finanzas",
      short_name: "Finanzas",
      lang: "es-CO",
      start_url: "/",
      display: "standalone",
    });
    expect(m.icons).toEqual([{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]);
  });
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementación**

`frontend/src/app/manifest.ts`:
```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finanzas",
    short_name: "Finanzas",
    description: "Finanzas personales",
    lang: "es-CO",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
```

`frontend/public/icon.svg` (provisional; el diseño final llega con impeccable):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#111"/><text x="256" y="330" font-size="240" text-anchor="middle" fill="#fff" font-family="sans-serif">$</text></svg>
```

En `frontend/src/app/layout.tsx` agrega (importa `Viewport` de `next`):
```tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};
```

- [ ] **Step 3: Ver que pasa**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo en verde; la salida del build lista `/manifest.webmanifest`.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(frontend): installable PWA manifest and mobile viewport"
```

---

### Task 16: Pruebas end-to-end con Playwright (backend real + parser fake) y job de CI

**Files:**
- Create: `backend/scripts/prepare_e2e_db.py`
- Create: `frontend/playwright.config.ts`, `frontend/e2e/helpers.ts`
- Create: `frontend/e2e/auth.spec.ts`, `frontend/e2e/register-manual.spec.ts`, `frontend/e2e/register-text.spec.ts`, `frontend/e2e/savings.spec.ts`, `frontend/e2e/recurring.spec.ts`
- Modify: `.github/workflows/frontend-ci.yml` (job `e2e`), `.gitignore` (`frontend/test-results/`, `frontend/playwright-report/`)

**Interfaces:**
- Consumes: CLI `create-user` (Task 1), job `/internal/jobs/recurring`, toda la UI anterior.
- Produces:
  - `prepare_e2e_db.py`: borra y recrea la BD `finanzas_e2e` (conexión de admin `E2E_ADMIN_URL`, por defecto `.../finanzas`), aplica migraciones y crea `e2e@example.com` / `clave-segura-e2e`.
  - Playwright levanta el backend en `:8010` (`AI_PARSER=fake`, `ALLOWED_ORIGIN=http://localhost:3100`, `CRON_TOKEN=e2e-cron-token`) y Next en `:3100` (`BACKEND_URL=http://localhost:8010`); un solo worker; perfil móvil "Pixel 7".
  - Helpers: `USER`, `login(page)`, `unique(prefix)`, `createAccount(page, name, typeLabel)`, `bogotaDay()`.

- [ ] **Step 1: Script de BD para e2e**

`backend/scripts/prepare_e2e_db.py`:
```python
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
        [sys.executable, "-m", "app.cli", "create-user", "e2e@example.com",
         "--password", "clave-segura-e2e", "--name", "E2E"],
        check=True,
        env=env,
    )


if __name__ == "__main__":
    main()
```

Run (desde `backend/`, con `docker compose up -d db`): `python -m uv run python scripts/prepare_e2e_db.py`
Expected: termina sin error e imprime `Usuario creado: e2e@example.com`. Correrlo dos veces seguidas también funciona (recrea la BD).

- [ ] **Step 2: Configuración de Playwright**

`frontend/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

const uv = process.env.UV_CMD ?? "python -m uv";
const env = process.env as Record<string, string>;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${uv} run python scripts/prepare_e2e_db.py && ${uv} run uvicorn app.main:app --port 8010`,
      cwd: "../backend",
      url: "http://localhost:8010/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...env,
        DATABASE_URL: "postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas_e2e",
        AI_PARSER: "fake",
        ALLOWED_ORIGIN: "http://localhost:3100",
        COOKIE_SECURE: "false",
        CRON_TOKEN: "e2e-cron-token",
        ENVIRONMENT: "development",
      },
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100/login",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...env, BACKEND_URL: "http://localhost:8010" },
    },
  ],
});
```

Run: `npx playwright install chromium`
Expected: descarga Chromium.

Agrega `frontend/test-results/` y `frontend/playwright-report/` al `.gitignore` de la raíz. Excluye `e2e/` y `playwright.config.ts` de Vitest (ya lo están: `include` solo toma `src/**` y `next.config.test.ts`).

- [ ] **Step 3: Helpers y specs**

`frontend/e2e/helpers.ts`:
```ts
import { expect, type Page } from "@playwright/test";

export const USER = { email: "e2e@example.com", password: "clave-segura-e2e" };

export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function bogotaDay(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", day: "2-digit" }).format(new Date()));
}

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Contraseña").fill(USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
}

export async function createAccount(page: Page, name: string, typeLabel = "Débito") {
  await page.goto("/mas/cuentas");
  await page.getByLabel("Nombre de la cuenta").fill(name);
  await page.getByLabel("Tipo").selectOption({ label: typeLabel });
  await page.getByRole("button", { name: "Agregar cuenta" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}
```

`frontend/e2e/auth.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { USER, login } from "./helpers";

test("rejects a wrong password and keeps the email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Contraseña").fill("incorrecta-000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email o contraseña incorrectos.");
  await expect(page.getByLabel("Email")).toHaveValue(USER.email);
});

test("redirects to login when there is no session and returns afterwards", async ({ page }) => {
  await page.goto("/movimientos");
  await expect(page).toHaveURL(/\/login\?next=%2Fmovimientos/);
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Contraseña").fill(USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Movimientos" })).toBeVisible();
});

test("logs out from Mi cuenta", async ({ page }) => {
  await login(page);
  await page.goto("/mas/cuenta");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
```

`frontend/e2e/register-manual.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("registers an expense manually and sees it in the list", async ({ page }) => {
  await login(page);
  const account = unique("Débito manual");
  await createAccount(page, account);
  await page.getByRole("link", { name: "Registrar" }).click();
  await page.getByRole("button", { name: "Registrar a mano" }).click();
  await page.getByLabel("Monto").fill("35.000");
  await page.getByLabel("Cuenta").selectOption({ label: account });
  await page.getByLabel("Categoría").selectOption({ label: "Comida" });
  await page.getByLabel("Descripción").fill("Almuerzo e2e");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status")).toHaveText("Movimiento guardado");
  await page.getByRole("button", { name: "Listo" }).click();
  await page.getByRole("link", { name: "Movimientos" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Almuerzo e2e" });
  await expect(row).toContainText("-$35.000");
});
```

`frontend/e2e/register-text.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("interprets free text with the fake parser and saves after confirmation", async ({ page }) => {
  await login(page);
  const account = unique("Debito texto");
  await createAccount(page, account);
  await page.goto("/registrar");
  await page.getByLabel("Cuéntame el movimiento").fill(`almorcé 35 mil comida con ${account.toLowerCase()}`);
  await page.getByRole("button", { name: "Interpretar" }).click();
  await expect(page.getByLabel("Monto")).toHaveValue("35.000");
  await expect(page.getByLabel("Categoría").locator("option:checked")).toHaveText("Comida");
  await expect(page.getByLabel("Cuenta").locator("option:checked")).toHaveText(account);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("status")).toHaveText("Movimiento guardado");
});
```

`frontend/e2e/savings.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { createAccount, login, unique } from "./helpers";

test("salary income suggests saving and creates the transfer", async ({ page }) => {
  await login(page);
  const debit = unique("Nómina");
  const savings = unique("Ahorro");
  await createAccount(page, debit);
  await createAccount(page, savings, "Ahorro");

  await page.goto("/mas/ahorro");
  await page.getByLabel("Modo").selectOption("percent");
  await page.getByLabel("Valor").fill("10");
  await page.getByLabel("Cuando entre dinero en").selectOption({ label: "Salario" });
  await page.getByLabel("Apartar en la cuenta").selectOption({ label: savings });
  await page.getByRole("button", { name: "Guardar regla" }).click();
  await expect(page.getByRole("status")).toHaveText("Regla guardada");

  await page.goto("/registrar");
  await page.getByRole("button", { name: "Registrar a mano" }).click();
  await page.getByRole("radio", { name: "Ingreso" }).check();
  await page.getByLabel("Monto").fill("3.000.000");
  await page.getByLabel("Cuenta").selectOption({ label: debit });
  await page.getByLabel("Categoría").selectOption({ label: "Salario" });
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("¿apartas $300.000 para tu ahorro?", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Apartar" }).click();
  await expect(page.getByText("Listo, apartaste $300.000.")).toBeVisible();
});
```

`frontend/e2e/recurring.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { bogotaDay, createAccount, login, unique } from "./helpers";

test("a recurring template generates a pending movement that can be confirmed", async ({ page, request }) => {
  await login(page);
  const account = unique("Débito arriendo");
  const description = unique("Arriendo");
  await createAccount(page, account);

  await page.goto("/mas/recurrentes");
  const form = page.getByRole("form", { name: "Nueva plantilla" });
  await form.getByLabel("Monto").fill("1.200.000");
  await form.getByLabel("Cuenta").selectOption({ label: account });
  await form.getByLabel("Categoría").selectOption({ label: "Vivienda" });
  await form.getByLabel("Descripción").fill(description);
  await form.getByLabel("Día del mes").fill(String(bogotaDay()));
  await form.getByRole("button", { name: "Agregar plantilla" }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  const job = await request.post("http://localhost:8010/internal/jobs/recurring", {
    headers: { Authorization: "Bearer e2e-cron-token" },
  });
  expect(job.ok()).toBeTruthy();
  expect((await job.json()).created).toBeGreaterThanOrEqual(1);

  await page.goto("/movimientos");
  const row = page.getByRole("listitem").filter({ hasText: description });
  await row.getByRole("button", { name: "Confirmar" }).click();
  await row.getByRole("button", { name: "Confirmar movimiento" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Movimiento guardado");
});
```

- [ ] **Step 4: Correr las pruebas e2e**

Run (desde `frontend/`, con Postgres arriba): `npm run e2e`
Expected: 7 pruebas pasan. Si alguna falla por un selector, corrige el selector o el label de la UI (manteniendo los nombres de la Interfaz de cada tarea); si falla por comportamiento, es un bug real: corrígelo con su test unitario correspondiente.

- [ ] **Step 5: Job e2e en CI**

En `.github/workflows/frontend-ci.yml` agrega el job:
```yaml
  e2e:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: finanzas
          POSTGRES_PASSWORD: finanzas
          POSTGRES_DB: finanzas_test
        ports: ["5434:5432"]
        options: >-
          --health-cmd "pg_isready -U finanzas"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      UV_CMD: uv
      E2E_ADMIN_URL: postgresql+psycopg://finanzas:finanzas@localhost:5434/finanzas_test
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
        working-directory: backend
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npx playwright install --with-deps chromium
        working-directory: frontend
      - run: npm run e2e
        working-directory: frontend
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/test-results
```
y agrega `"backend/**"` a los `paths` de `push` y `pull_request` del workflow, para que un cambio de backend también dispare las e2e.

- [ ] **Step 6: Verificación final**

Run (desde `frontend/`): `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Run (desde `backend/`): `python -m uv run ruff check . && python -m uv run mypy app && python -m uv run pytest -q`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add backend/scripts frontend .github .gitignore
git commit -m "test(e2e): Playwright flows for login, manual and text entry, savings and recurring"
```
