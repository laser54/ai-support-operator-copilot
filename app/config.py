"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration safe to load without provider credentials."""

    app_name: str = "AI Support Operator Copilot"
    environment: str = "local"
    log_level: str = "INFO"
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    database_url: str = "postgresql+psycopg://copilot:copilot@localhost:5432/copilot"
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    intake_rate_limit: int = 10
    intake_rate_window_seconds: int = 3_600

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """Return cached settings for the current process."""

    return Settings()
