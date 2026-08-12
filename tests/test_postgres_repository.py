"""PostgreSQL integration tests for the persistence foundation."""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.audit import tool_call_event
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
        connection.execute(text("TRUNCATE TABLE cases CASCADE"))

    with session_factory() as write_session:
        created = CaseRepository(write_session).create("Login returns HTTP 500 after update")

    with session_factory() as read_session:
        reloaded = CaseRepository(read_session).get(created.id)

    assert reloaded is not None
    assert reloaded.id == created.id
    assert reloaded.raw_request == "Login returns HTTP 500 after update"
    assert reloaded.status == "received"


def test_audit_events_persist_in_case_sequence_order() -> None:
    assert TEST_DATABASE_URL is not None
    engine = create_engine(TEST_DATABASE_URL)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE audit_events, cases CASCADE"))

    with session_factory() as session:
        repository = CaseRepository(session)
        case = repository.create("Login returns HTTP 500 after update")
        second = repository.add_audit_event(
            tool_call_event(
                case_id=case.id,
                tool_name="find_similar_cases",
                inputs={"summary": "login HTTP 500"},
                evidence_source_ids=["inc-104"],
            )
        )
        first = repository.add_audit_event(
            tool_call_event(
                case_id=case.id,
                tool_name="search_knowledge",
                inputs={"query": "login HTTP 500"},
                evidence_source_ids=["kb-auth-5xx-after-release"],
            )
        )
        reloaded = repository.list_audit_events(case.id)

    assert [second.sequence, first.sequence] == [1, 2]
    assert [event.name for event in reloaded] == ["find_similar_cases", "search_knowledge"]
    assert [event.sequence for event in reloaded] == [1, 2]
