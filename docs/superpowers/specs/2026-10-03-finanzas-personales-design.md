# Finanzas personales — Documento de diseño (MVP)

- **Fecha:** 2026-10-03
- **Estado:** aprobado en brainstorming, pendiente de revisión escrita
- **Alcance de este documento:** Fase 1 (MVP) en detalle; fases 2 y 3 solo como contexto para no cerrar puertas.

## 1. Objetivo y contexto

Registrar y entender las finanzas personales mes a mes: cuánto se gana, en qué se gasta, cuánto se ahorra y si se cumplen los presupuestos.

- Usuario inicial: el autor (desarrollador, Colombia, celular Android). Uso principal desde el celular.
- El diseño contempla **multiusuario y autenticación desde el día 1**, para poder abrir la app a otros usuarios más adelante sin migrar la identidad.
- Moneda única: **COP**, enteros sin decimales, formato de presentación `$1.250.000`.
- Idioma: español (interfaz y dictado, `es-CO`).
- Esta fase define producto, datos y arquitectura. **El diseño visual se trabaja después** (skill impeccable); aquí no se definen estilos.

### Criterios de éxito

1. Registrar un gasto por voz desde el celular en **menos de 10 segundos** de punta a punta (borrador de la IA en menos de 3 s).
2. Saber en cualquier momento cuánto se lleva gastado en el mes frente al presupuesto, por categoría.
3. Ver cuánto se ahorró en el mes y compararlo con meses anteriores.

## 2. Alcance por fases

### Fase 1 — MVP (este documento)

- Autenticación multiusuario (registro solo por invitación).
- Cuentas y medios de pago (`cash`, `debit`, `savings`, `credit_card`) con saldo calculado.
- Categorías editables por usuario, con un conjunto predefinido.
- Transacciones: ingreso, egreso, transferencia entre cuentas.
- Registro manual y **registro por voz/texto libre** interpretado por Claude, siempre con confirmación.
- **"Págate primero"**: sugerencia de apartar ahorro al recibir el salario.
- Presupuestos por categoría con alertas (80 % y 100 %).
- Gastos recurrentes que generan movimientos "por confirmar".
- Dashboard mensual y comparativo entre meses.
- Lista de movimientos con filtros, edición y borrado.

### Fase 2 — Capa analítica con IA (fuera del MVP)

- Reportes en lenguaje natural ("¿en qué gasté más en septiembre?").
- Predicciones y recomendaciones: el backend calcula (promedios, ritmo de gasto, proyección de fin de mes) y Claude solo explica y recomienda; **nunca inventa cifras**.

### Fase 3 — Futuro (fuera del MVP)

- Metas de ahorro.
- Deudas y tarjetas de crédito completas (fecha de corte, cupo, cuotas).
- Importación (y exportación) de extractos en CSV.
- Transcripción de voz en servidor, envío de email (invitaciones, reset), notificaciones push.

## 3. Arquitectura

```
[Celular / PC] ── Next.js (Vercel, PWA)
                     │  rewrites /api/* → FastAPI (mismo origen, cookies httpOnly)
                     ▼
               FastAPI (Railway) ──► Postgres (Neon)
                     │
                     └──► Claude API (solo desde el backend)
       GitHub Actions cron ──► POST /internal/jobs/recurring (token)
```

### Repositorio

Monorepo:

- `backend/` — FastAPI, SQLAlchemy 2, Alembic, Pydantic, pytest.
- `frontend/` — Next.js (App Router), TypeScript, TanStack Query, Vitest, Playwright.
- `docs/` — especificaciones y planes.
- `.github/workflows/` — CI y cron de recurrentes.

### Backend: módulos por dominio

Cada módulo contiene `router` (HTTP), `service` (reglas de negocio), `repository` (acceso a datos) y `schemas` (Pydantic).

| Módulo | Responsabilidad |
|---|---|
| `auth` | usuarios, invitaciones, login/logout, sesiones, cookies |
| `accounts` | cuentas y medios de pago, cálculo de saldos |
| `categories` | categorías por usuario; siembra de predefinidas al crear usuario |
| `transactions` | CRUD de ingreso/egreso/transferencia, filtros, paginación |
| `savings` | regla "págate primero" y cálculo de sugerencia |
| `budgets` | presupuestos por categoría, estado y niveles de alerta |
| `recurring` | plantillas y generación de movimientos pendientes |
| `dashboard` | agregados mensuales y comparativos (solo lectura) |
| `ai` | interfaz `TransactionParser`: texto → borrador de transacción |

### Principios transversales

- **Dinero:** `BIGINT` en pesos enteros. Nunca floats. El formateo `$1.250.000` ocurre solo en el frontend.
- **Fechas:** las transacciones usan `date` (sin hora). "Hoy" y "este mes" se calculan en la zona horaria del usuario (por defecto `America/Bogota`).
- **Aislamiento entre usuarios:** el `user_id` proviene siempre de la sesión, nunca del cuerpo ni de la URL. Todo repositorio filtra por `user_id` de forma obligatoria. Un recurso de otro usuario responde `404`.
- **IA desacoplada:** `TransactionParser` es un `Protocol` con dos implementaciones: `ClaudeTransactionParser` y `FakeTransactionParser`. Ningún otro módulo llama a Anthropic. Se elige por la variable `AI_PARSER=claude|fake`.
- **Contrato frontend/backend:** los tipos TypeScript se generan desde el OpenAPI de FastAPI.

## 4. Modelo de datos

Todas las tablas tienen `id UUID`, `created_at` y `updated_at`. Las tablas de dominio tienen `user_id` (FK, indexado). Los montos son `BIGINT` en pesos.

### Identidad

**`users`**
- `email` (único), `password_hash` (argon2id), `display_name`, `timezone` (por defecto `America/Bogota`), `is_active`.

**`invitations`**
- `email`, `token_hash`, `expires_at`, `used_at`.
- Es la única vía de registro en el MVP. Se crean por comando CLI.

**`sessions`**
- `user_id`, `token_hash`, `expires_at`, `revoked_at`, `user_agent`.

### Dominio

**`accounts`**
- `name`, `type` (`cash | debit | savings | credit_card`), `initial_balance`, `archived_at`.
- **El saldo no se guarda; se calcula**: `initial_balance` + ingresos − egresos + transferencias entrantes − transferencias salientes, contando solo transacciones `confirmed`.
- **Tarjeta de crédito:** una compra es un egreso desde la cuenta TC, cuyo saldo queda negativo (eso es la deuda). Pagar la tarjeta es una transferencia débito → TC. El gasto cuenta en el mes de la compra.

**`categories`**
- `name`, `kind` (`income | expense`), `archived_at`.
- Único por (`user_id`, `name`, `kind`).
- **Predefinidas al registrar el usuario:**
  - Ingreso: Salario, Ingreso extra.
  - Egreso: Comida, Transporte, Vivienda, Servicios, Suscripciones, Salud, Ocio, Otros.

**`transactions`**
- `type` (`income | expense | transfer`), `amount` (> 0), `date`.
- `account_id` (origen; o destino si es un ingreso), `to_account_id` (solo en transferencias, distinta de `account_id`).
- `category_id` (obligatoria en `income`/`expense`; nula en `transfer`; su `kind` debe coincidir con el tipo).
- `description` (opcional), `status` (`confirmed | pending`), `source` (`manual | voice | recurring | savings_rule`), `recurring_template_id` (nullable).
- `CHECK` constraints para la coherencia de tipo y campos.
- Índices: (`user_id`, `date`) y (`user_id`, `category_id`, `date`).
- `UNIQUE (recurring_template_id, date)` para que los recurrentes sean idempotentes.

**`budgets`**
- `category_id` (categoría de egreso), `amount`, `valid_from` (primer día del mes).
- Único por (`user_id`, `category_id`, `valid_from`).
- El presupuesto vigente para el mes M es la fila con el mayor `valid_from ≤ M`. Para eliminar un presupuesto desde un mes, se registra `amount = 0` con ese `valid_from` (0 equivale a "sin presupuesto").

**`savings_rules`** (máximo una por usuario)
- `mode` (`percent | fixed`), `value` (porcentaje 1–100 o monto en pesos).
- `trigger_category_id` (categoría de ingreso, normalmente Salario), `target_account_id` (cuenta tipo `savings`), `active`.

**`recurring_templates`**
- `type`, `amount`, `account_id`, `to_account_id`, `category_id`, `description` (los mismos campos y reglas de coherencia que una transacción).
- `day_of_month` (1–31; si el mes es más corto, se usa el último día del mes).
- `start_date`, `end_date` (nullable), `next_run_date`, `active`.
- Frecuencia: solo mensual en el MVP.

### Reglas de datos

1. Las transacciones `pending` **no afectan** saldos, presupuestos ni totales del dashboard. Se muestran aparte como "por confirmar" o "comprometido".
2. Las cuentas y categorías con transacciones asociadas **se archivan, no se borran**. Las archivadas no aparecen al registrar, pero sí en el historial. Las que no tienen transacciones sí se pueden borrar.
3. Las transacciones se borran físicamente.
4. **Las alertas de presupuesto no se guardan; se calculan** en cada consulta.
5. **Nunca se guarda el texto ni el audio del dictado.** Solo queda `source = voice`.

## 5. Flujo de registro por voz (punta a punta)

```
[Micrófono / teclado] → texto editable → POST /api/ai/parse-transaction
  → contexto mínimo → Claude (tool use) → validación → BORRADOR (no se guarda)
  → formulario prellenado → usuario confirma → POST /api/transactions (source=voice)
  → respuesta con estado de presupuesto / sugerencia de ahorro
```

### 5.1 Captura (frontend)

- La caja "Registro rápido" acepta texto libre, de 300 caracteres como máximo.
- **Botón de micrófono:** usa la Web Speech API (`lang = es-CO`, resultados parciales en vivo) cuando el navegador la soporta. Lo dictado cae en la caja y **es editable antes de enviar**.
- Si no hay Web Speech, el botón se oculta y el usuario usa el micrófono del teclado (Gboard).
- **La API de Claude no transcribe audio.** Al backend solo llega texto. La transcripción en servidor queda para la fase 3, detrás de una interfaz `SpeechTranscriber`, que no se implementa en el MVP.

### 5.2 Interpretación (backend)

- **Endpoint:** `POST /api/ai/parse-transaction`, cuerpo `{ "text": string }`.
- **Rate limit:** 30 solicitudes por hora por usuario.
- **Contexto que se envía a Claude**, y solo esto:
  - la fecha de hoy en la zona horaria del usuario;
  - los IDs y nombres de las categorías activas, con su `kind`;
  - los IDs, nombres y tipos de las cuentas activas;
  - el texto.
- **No se envían** saldos, historial, montos previos, email ni nombre.
- **Llamada con tool use** y un esquema estricto `draft_transaction`:
  - `type`, `amount` (entero), `date` (ISO), `category_id`, `account_id`, `to_account_id`, `description`;
  - `missing_fields: string[]`, `notes: string[]`.
  - Los campos de ID se restringen a un `enum` con los IDs reales del usuario.
- **El prompt incluye jerga colombiana con ejemplos:**
  - "35 mil" → 35000; "una luca" → 1000; "2 palos" → 2000000;
  - fechas relativas: "ayer", "el viernes";
  - medios de pago: "con la débito", "con la tarjeta";
  - "pagué la tarjeta" → transferencia.
- **Modelo configurable** por la variable `CLAUDE_MODEL`. Por defecto, Haiku (latencia y costo); el ID exacto se verifica en el plan.
- **Timeout:** 8 s.
- **Validación con Pydantic** sobre la salida:
  - los IDs deben pertenecer al usuario y estar activos;
  - `amount > 0`;
  - `date` dentro de ±1 año desde hoy;
  - el `kind` de la categoría debe ser coherente con `type`.
- Todo campo que no pase la validación se anula y se agrega a `missing_fields`.
- **Respuesta:** un borrador que **no se guarda nunca**.

### 5.3 Confirmación (frontend)

- Se abre el mismo formulario del registro manual, prellenado. Los campos de `missing_fields` aparecen resaltados.
- **Valores por defecto** si faltan: la fecha es hoy; la cuenta es la última usada (guardada localmente en el dispositivo).
- Al confirmar se llama a `POST /api/transactions` con `source = voice`, el mismo endpoint que el registro manual.

### 5.4 Errores

- **Timeout o error de la API de Claude:** `503` con el código `AI_UNAVAILABLE`. El frontend conserva el texto y abre el formulario vacío con el mensaje "No pude interpretarlo, complétalo a mano".
- **Texto ininterpretable:** borrador con los campos en nulo. Nunca se inventa un monto.
- **Rate limit superado:** `429` con el código `AI_RATE_LIMITED`.
- **Logs:** solo metadatos (latencia, tokens de entrada y salida, éxito o fallo, modelo). **Nunca el texto.**

## 6. Reglas de negocio

### 6.1 "Págate primero"

- **Al confirmar** un ingreso cuya categoría sea el `trigger_category_id` de una regla activa (sea un registro nuevo o un pendiente que se confirma), la respuesta incluye `savings_suggestion`:
  - **monto:** en modo `percent`, `floor(amount × value / 100)`; en modo `fixed`, `min(value, amount)`;
  - **cuenta origen:** la cuenta del ingreso;
  - **cuenta destino:** `target_account_id`.
- **Acciones del usuario:**
  - Aceptar (puede editar el monto): se crea una transferencia `confirmed` con `source = savings_rule`.
  - Descartar: no se crea nada.
- **Recordatorio:** si en el mes hay ingresos en la categoría disparadora pero no hay transferencias hacia cuentas `savings`, el dashboard lo indica.
- **Ahorro del mes** = transferencias confirmadas hacia cuentas `savings` − transferencias confirmadas desde cuentas `savings`, en el mes.
- **Tasa de ahorro** = ahorro del mes ÷ ingresos del mes (nula si no hubo ingresos).

### 6.2 Presupuestos

- **Endpoint:** `GET /api/budgets/status?month=YYYY-MM`.
- **Respuesta por cada categoría de egreso activa:**
  - presupuesto vigente;
  - gastado (egresos `confirmed` del mes);
  - restante y porcentaje;
  - nivel: `ok` (< 80 %), `warning` (80 % – < 100 %) o `exceeded` (≥ 100 %);
  - `committed`: egresos `pending` del mes.
- Las categorías sin presupuesto (o con presupuesto 0) devuelven `level = none` y su gasto.
- **Tras crear o confirmar un egreso**, la respuesta de `POST /api/transactions` incluye el estado del presupuesto de esa categoría para ese mes.

### 6.3 Recurrentes

- **Job diario:** cron de GitHub Actions a las 11:00 UTC (6:00 en Bogotá) → `POST /internal/jobs/recurring` con el header `Authorization: Bearer <CRON_TOKEN>`.
- **Proceso**, para cada plantilla `active` con `next_run_date ≤ hoy` y dentro de `[start_date, end_date]`:
  - crea una transacción `pending` con `source = recurring` para cada fecha atrasada (se pone al día con los días perdidos);
  - avanza `next_run_date`.
- **Idempotente** gracias a `UNIQUE (recurring_template_id, date)`: correr el job dos veces no duplica nada.
- **Acciones del usuario sobre un pendiente:**
  - **confirmar** (editando el monto u otros campos si hace falta);
  - **descartar** (se borra; la fecha ya quedó avanzada en la plantilla, así que no se regenera).

### 6.4 Dashboard

**`GET /api/dashboard/monthly?month=YYYY-MM`** devuelve:
- ingresos, egresos, ahorro del mes, balance (ingresos − egresos) y tasa de ahorro;
- gasto por categoría;
- resumen de presupuestos (los niveles de 6.2);
- pendientes del mes;
- saldos actuales por cuenta;
- recordatorio de "págate primero" si aplica.

**`GET /api/dashboard/compare?months=6`** devuelve, para los N meses hasta el actual:
- la serie mensual de ingresos, egresos y ahorro;
- el gasto por categoría, con la variación absoluta y porcentual frente al mes anterior.

**Reglas de cálculo**
- Las transferencias **nunca** cuentan como ingreso ni como egreso.
- Todo se calcula con agregaciones SQL al consultar. No hay tablas precalculadas en el MVP.

### 6.5 Lista de movimientos

- **Endpoint:** `GET /api/transactions`.
- **Filtros:** `from`, `to`, `type`, `category_id`, `account_id`, `status` y `q` (texto en la descripción).
- **Orden:** por `date` descendente y luego `created_at` descendente.
- **Paginación** por cursor.
- **Operaciones:** editar (`PATCH`) y borrar (`DELETE`).

## 7. Seguridad

- **Sesiones opacas en el servidor:**
  - un token aleatorio de 256 bits en una cookie `httpOnly`, `Secure`, `SameSite=Lax`;
  - en `sessions` se guarda el hash SHA-256 del token;
  - expiración deslizante de 30 días; logout y revocación inmediatos.
- **Contraseñas:** argon2id; mínimo 10 caracteres.
- **Rate limit del login:** 5 intentos por minuto por combinación de IP y email.
- **CSRF:** mismo origen vía los rewrites de Next, `SameSite=Lax` y verificación del header `Origin` en todo método que modifica datos (`POST`, `PATCH`, `PUT`, `DELETE`).
- **Invitaciones y reset de contraseña:** por comando CLI de administración (`python -m app.cli invite <email>`, `python -m app.cli reset-password <email>`), que imprime el enlace o token. Sin proveedor de email en el MVP.
- **Secretos:** solo en variables de entorno (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CRON_TOKEN`, `AI_PARSER`, `ALLOWED_ORIGIN`). La API key de Anthropic nunca llega al frontend.
- **Aislamiento:** cada endpoint de dominio tiene un test de acceso cruzado (el usuario B recibe `404` sobre los recursos del usuario A).
- **Respaldo:** restore a un punto en el tiempo de Neon.

## 8. Manejo de errores

- **Formato uniforme:** `{"error": {"code": "STRING_CODE", "message": "texto legible", "details": {...}}}`.
- **Códigos de validación de dominio** con su status HTTP (`422` para validación, `404` para no encontrado o ajeno, `409` para conflictos como nombres duplicados, `401` sin sesión, `429` para rate limit, `503` si la IA no está disponible).
- **Frontend:**
  - traduce los códigos a mensajes en español;
  - **nunca descarta los datos de un formulario** ante un error.

## 9. Testing (TDD)

Cada funcionalidad se desarrolla test primero.

### Backend (pytest)

- **Unitarios** de la lógica pura:
  - cálculo de saldos;
  - niveles de presupuesto y presupuesto vigente por mes;
  - cálculo de la sugerencia de ahorro;
  - fechas de recurrentes (día 31 en meses cortos, años bisiestos, puesta al día);
  - "hoy" y "este mes" en `America/Bogota`.
- **Integración de la API** con httpx (`AsyncClient`) contra **Postgres real**: Docker en local, *service container* en CI, con rollback por test.
- **Acceso cruzado entre usuarios** en todos los endpoints de dominio.

### IA

- **`FakeTransactionParser`** en los tests de servicio y de API.
- **`ClaudeTransactionParser`** probado con el cliente de Anthropic mockeado: construcción del contexto mínimo, mapeo del tool use, validación y anulación de campos inválidos, timeouts.
- **Set de evaluación** de unas 30 frases colombianas con su resultado esperado (`make eval-parser`), contra la API real. Se corre a mano; no corre en CI.

### Frontend

- **Vitest y Testing Library:**
  - formato `$1.250.000`;
  - parseo de montos que escribe el usuario;
  - formulario de confirmación con campos faltantes;
  - presencia o ausencia del botón de micrófono.
- **Playwright** (flujos críticos contra el backend local con `AI_PARSER=fake`):
  - login;
  - registro manual;
  - flujo de voz y texto con confirmación;
  - aceptar la sugerencia de ahorro;
  - confirmar un recurrente.

### CI (GitHub Actions)

- **Backend:** ruff, mypy y pytest (con el service container de Postgres).
- **Frontend:** eslint, `tsc --noEmit` y vitest.
- **Playwright** en los PR hacia `main`.

## 10. Despliegue y entornos

- **Local:**
  - `docker compose` con Postgres;
  - FastAPI en `:8000`;
  - Next.js en `:3000` con rewrite de `/api/*` a `:8000`;
  - `AI_PARSER=fake` por defecto.
- **Producción:**
  - **Vercel:** frontend, con previews por PR;
  - **Railway:** backend en Docker, siempre encendido; `alembic upgrade head` en cada release;
  - **Neon:** Postgres, con la rama `main` para producción y la rama `dev` para desarrollo;
  - **GitHub Actions:** CI y cron de recurrentes.
- **Costo estimado:** unos USD 5 al mes (Railway). Vercel y Neon en su capa gratuita. El costo de Claude se mide con los logs de tokens; para uso personal se espera que sea marginal.
- **No se usa el plan gratuito de Render**, porque el arranque en frío (30–60 s) incumple el criterio de los 10 segundos.

## 11. Decisiones explícitas (resumen)

| Decisión | Elección | Motivo |
|---|---|---|
| Autenticación | Propia en FastAPI, con sesiones opacas | Control total, sin atarse a un proveedor, revocable, encaja con multiusuario futuro |
| Transcripción | Navegador (Web Speech y micrófono del teclado); el backend solo recibe texto | Gratis, funciona en Android, sin proveedor extra; la transcripción en servidor queda detrás de una interfaz |
| Interpretación | Claude con tool use, contexto mínimo, confirmación obligatoria | Frases naturales y jerga local, minimización de datos |
| Dinero | `BIGINT` en pesos | COP sin decimales, sin errores de punto flotante |
| Pendientes | No cuentan en saldos ni presupuestos | Evitar contar gastos no confirmados |
| Tarjeta de crédito | Cuenta con saldo negativo; el pago es una transferencia | Simple, sin doble conteo; el detalle de TC queda para la fase 3 |
| Hosting | Vercel + Railway + Neon | Barato, siempre encendido, portable |
