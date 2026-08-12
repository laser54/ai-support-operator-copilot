"""PostgreSQL integration tests for the persistence foundation."""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.persistence.repositories import CaseRepository

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is required for PostgreSQL integration tests"
)


def test_case_repository_persists_and_reloads_across_sessions() -> None:
    assert TEST_DATABASE_URL is not None
    engine = create_engine(TEST_DATABASE_URL)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE cases"))

    with session_factory() as write_session:
        created = CaseRepository(write_session).create("Login returns HTTP 500 after update")

    with session_factory() as read_session:
        reloaded = CaseRepository(read_session).get(created.id)

    assert reloaded is not None
    assert reloaded.id == created.id
    assert reloaded.raw_request == "Login returns HTTP 500 after update"
    assert reloaded.status == "received"
