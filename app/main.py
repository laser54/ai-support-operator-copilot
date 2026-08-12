"""FastAPI application entrypoint."""

from fastapi import FastAPI

from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="A traceable workflow for human-reviewed support actions.",
)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Report that the API process is available."""

    return {"status": "ok"}
