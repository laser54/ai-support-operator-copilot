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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    """Return cached settings for the current process."""

    return Settings()
