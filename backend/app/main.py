import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.accounts.router import router as accounts_router
from app.ai.router import router as ai_router
from app.auth.router import router as auth_router
from app.budgets.router import router as budgets_router
from app.categories.router import router as categories_router
from app.core.config import get_settings, validate_production_settings
from app.core.errors import error_body, register_error_handlers
from app.core.ratelimit import RateLimiter
from app.dashboard.router import router as dashboard_router
from app.recurring.router import internal_router as recurring_internal_router
from app.recurring.router import router as recurring_router
from app.savings.router import router as savings_router
from app.transactions.router import router as transactions_router

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _configure_logging() -> None:
    logger = logging.getLogger("app")
    logger.setLevel(logging.INFO)
    if not any(getattr(h, "_finanzas", False) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler._finanzas = True  # type: ignore[attr-defined]
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
        logger.addHandler(handler)
    logger.propagate = False


def create_app() -> FastAPI:
    _configure_logging()
    settings = get_settings()
    problems = validate_production_settings(settings)
    if problems:
        raise RuntimeError("Configuración de producción inválida: " + "; ".join(problems))
    app = FastAPI(title="Finanzas API")
    app.state.login_limiter = RateLimiter(settings.login_rate_limit_per_minute, 60)
    app.state.login_email_limiter = RateLimiter(settings.login_email_rate_limit_per_minute, 60)
    app.state.ai_limiter = RateLimiter(settings.ai_rate_limit_per_hour, 3600)
    register_error_handlers(app)

    @app.middleware("http")
    async def check_origin(request: Request, call_next: RequestResponseEndpoint) -> Response:
        origin = request.headers.get("origin")
        if (
            request.method in MUTATING_METHODS
            and origin is not None
            and origin != settings.allowed_origin
        ):
            return JSONResponse(
                status_code=403, content=error_body("ORIGIN_NOT_ALLOWED", "Origen no permitido")
            )
        return await call_next(request)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(categories_router)
    app.include_router(accounts_router)
    app.include_router(transactions_router)
    app.include_router(budgets_router)
    app.include_router(savings_router)
    app.include_router(recurring_router)
    app.include_router(recurring_internal_router)
    app.include_router(dashboard_router)
    app.include_router(ai_router)
    return app


app = create_app()
