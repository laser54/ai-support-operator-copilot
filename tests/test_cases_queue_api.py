"""Tests for GET /cases queue endpoint with search, filters, and pagination."""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.domain.contracts import ActionKind, ActionState, RiskLevel
from app.main import app
from app.persistence.database import get_session
from app.persistence.models import Base, CaseRecord
from app.persistence.repositories import CaseRepository


@pytest.fixture
def sqlite_session_factory() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(sqlite_session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    def _override_session() -> Generator[Session, None, None]:
        with sqlite_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _override_session
    yield TestClient(app)
    app.dependency_overrides.pop(get_session, None)


def _seed_case(
    session: Session,
    request_text: str,
    *,
    status: str = "awaiting_human_review",
    priority: str = "P1",
    risk: str = "high",
    created_at: datetime | None = None,
) -> CaseRecord:
    repository = CaseRepository(session)
    record = repository.create(request_text, status=status)
    if created_at is not None:
        record.created_at = created_at
        session.commit()

    action_id = str(uuid4())
    state = {
        "case_id": str(record.id),
        "status": status,
        "version": 1,
        "request_text": request_text,
        "triage": {
            "priority": priority,
            "category": "access",
            "risk": risk,
            "confidence": 0.9,
        },
        "evidence": [],
        "resolution_brief": {
            "requester_facts": [request_text],
            "evidence": [],
            "inferences": [],
            "missing_information": [],
            "proposed_actions": [
                {
                    "id": action_id,
                    "kind": ActionKind.CREATE_INCIDENT.value,
                    "payload_preview": "Create mock incident",
                    "risk": RiskLevel.HIGH.value,
                    "approval_required": True,
                    "state": ActionState.PROPOSED.value,
                }
            ],
            "reply_draft": "Investigating.",
        },
        "provider": "deterministic_fallback",
    }
    repository.save_workflow_state(record.id, state)
    return record


def test_list_cases_empty(client: TestClient) -> None:
    response = client.get("/cases")
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert data["total_pages"] == 0


def test_list_cases_pagination(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        for i in range(15):
            _seed_case(session, f"Request number {i + 1:02d}")

    # Page 1
    res1 = client.get("/cases?page=1&page_size=10")
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1["items"]) == 10
    assert data1["total"] == 15
    assert data1["page"] == 1
    assert data1["page_size"] == 10
    assert data1["total_pages"] == 2

    # Page 2
    res2 = client.get("/cases?page=2&page_size=10")
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["items"]) == 5
    assert data2["total"] == 15
    assert data2["page"] == 2
    assert data2["page_size"] == 10
    assert data2["total_pages"] == 2


def test_list_cases_filter_status(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        _seed_case(session, "Awaiting review 1", status="awaiting_human_review")
        _seed_case(session, "Awaiting review 2", status="awaiting_human_review")
        _seed_case(session, "Completed case", status="completed")
        _seed_case(session, "Rejected case", status="rejected")

    res = client.get("/cases?status=awaiting_human_review")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert all(item["status"] == "awaiting_human_review" for item in data["items"])

    res_comp = client.get("/cases?status=completed")
    assert res_comp.status_code == 200
    data_comp = res_comp.json()
    assert data_comp["total"] == 1
    assert data_comp["items"][0]["status"] == "completed"


def test_list_cases_filter_priority(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        _seed_case(session, "Critical 500 error", priority="P1")
        _seed_case(session, "VPN slow", priority="P2")
        _seed_case(session, "Feature inquiry", priority="P3")

    res_p1 = client.get("/cases?priority=P1")
    assert res_p1.status_code == 200
    data_p1 = res_p1.json()
    assert data_p1["total"] == 1
    assert data_p1["items"][0]["priority"] == "P1"

    res_p2 = client.get("/cases?priority=P2")
    assert res_p2.status_code == 200
    data_p2 = res_p2.json()
    assert data_p2["total"] == 1
    assert data_p2["items"][0]["priority"] == "P2"


def test_list_cases_search_text(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        _seed_case(session, "Sales portal login 500 error after release")
        _seed_case(session, "VPN certificate rotation issue")
        _seed_case(session, "Invoice PDF download timeout")

    res = client.get("/cases?q=login+500")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert "login 500" in data["items"][0]["request_text"].lower()


def test_list_cases_search_exact_uuid(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        c1 = _seed_case(session, "Case 1")
        _seed_case(session, "Case 2")

    target_id = str(c1.id)
    res = client.get(f"/cases?q={target_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["case_id"] == target_id


def test_list_cases_stable_ordering(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    base_time = datetime(2026, 8, 1, 12, 0, 0, tzinfo=UTC)
    with sqlite_session_factory() as session:
        c1 = _seed_case(session, "Case identical time 1", created_at=base_time)
        c2 = _seed_case(session, "Case identical time 2", created_at=base_time)
        c3 = _seed_case(session, "Case newer time", created_at=base_time + timedelta(hours=1))

    res = client.get("/cases?page_size=10")
    assert res.status_code == 200
    items = res.json()["items"]
    # c3 must be first (newer created_at)
    assert items[0]["case_id"] == str(c3.id)
    # c1 and c2 have identical created_at, tie-breaker is id.desc()
    expected_second_id = str(max(c1.id, c2.id))
    expected_third_id = str(min(c1.id, c2.id))
    assert items[1]["case_id"] == expected_second_id
    assert items[2]["case_id"] == expected_third_id


def test_list_cases_combined_filters(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        _seed_case(
            session, "Authentication 500 error", status="awaiting_human_review", priority="P1"
        )
        _seed_case(session, "Authentication timeout", status="completed", priority="P1")
        _seed_case(session, "Billing report delay", status="awaiting_human_review", priority="P2")

    res = client.get("/cases?status=awaiting_human_review&priority=P1&q=Authentication")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["request_text"] == "Authentication 500 error"


def test_list_cases_parameter_validation(client: TestClient) -> None:
    # page < 1
    assert client.get("/cases?page=0").status_code == 422
    assert client.get("/cases?page=-1").status_code == 422

    # page_size > 100
    assert client.get("/cases?page_size=101").status_code == 422
    assert client.get("/cases?page_size=0").status_code == 422

    # invalid status
    assert client.get("/cases?status=unknown_status").status_code == 422

    # invalid priority
    assert client.get("/cases?priority=P99").status_code == 422
