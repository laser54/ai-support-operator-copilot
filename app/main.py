"""FastAPI application entrypoint."""

from fastapi import FastAPI

from app.api.cases import router as cases_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="A traceable workflow for human-reviewed support actions.",
)
app.include_router(cases_router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Report that the API process is available."""

    return {"status": "ok"}
