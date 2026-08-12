"""SQLAlchemy engine and session lifecycle helpers."""

from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings


def create_database_engine(database_url: str) -> Engine:
    """Build an engine for PostgreSQL without opening a connection eagerly."""

    return create_engine(database_url, pool_pre_ping=True)


def create_session_factory(database_url: str) -> sessionmaker[Session]:
    """Build a session factory for the supplied database URL."""

    return sessionmaker(bind=create_database_engine(database_url), expire_on_commit=False)


def get_session(settings: Settings | None = None) -> Generator[Session, None, None]:
    """Yield a request-scoped database session and always close it."""

    active_settings = settings or get_settings()
    session_factory = create_session_factory(active_settings.database_url)
    with session_factory() as session:
        yield session
