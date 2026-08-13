"""FastAPI application entrypoint."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.artifacts import router as artifacts_router
from app.api.cases import router as cases_router
from app.api.errors import error_envelope
from app.config import get_settings
from app.rate_limit import IntakeRateLimiter


def _cors_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


async def handle_http_exception(_request: Request, exc: Exception) -> JSONResponse:
    """Expose expected HTTP failures as a machine-readable envelope."""

    if not isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=exc.status_code,
        content=error_envelope(exc.status_code, exc.detail),
    )


def create_app() -> FastAPI:
    """Build the API application with CORS and error envelope wiring."""

    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="A traceable workflow for human-reviewed support actions.",
    )
    origins = _cors_origins(settings.cors_allow_origins)
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type"],
        )
    application.state.intake_rate_limiter = IntakeRateLimiter(
        limit=settings.intake_rate_limit,
        window_seconds=settings.intake_rate_window_seconds,
    )
    application.add_exception_handler(HTTPException, handle_http_exception)
    application.include_router(cases_router)
    application.include_router(artifacts_router)
    application.add_api_route("/health", health, methods=["GET"], tags=["system"])
    return application


def health() -> dict[str, str]:
    """Report that the API process is available."""

    return {"status": "ok"}


app = create_app()
