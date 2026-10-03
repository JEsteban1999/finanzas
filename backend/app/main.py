from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.accounts.router import router as accounts_router
from app.auth.router import router as auth_router
from app.categories.router import router as categories_router
from app.core.config import get_settings
from app.core.errors import error_body, register_error_handlers
from app.core.ratelimit import RateLimiter

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Finanzas API")
    app.state.login_limiter = RateLimiter(settings.login_rate_limit_per_minute, 60)
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
    return app


app = create_app()
