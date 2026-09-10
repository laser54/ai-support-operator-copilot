"""Tests for saving and resetting review drafts (Issue #2)."""

from collections.abc import Generator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.domain.contracts import (
    ActionKind,
    ActionState,
    Priority,
    Review,
    ReviewDecision,
    ReviewEdits,
    RiskLevel,
)
from app.main import app
from app.persistence.database import get_session
from app.persistence.models import Base, CaseRecord, MockIncidentRecord
from app.persistence.repositories import CaseRepository
from app.review import ReviewConflictError, ReviewDraftInput, ReviewService


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


def _seed_awaiting_case(
    session: Session,
    request_text: str = "Customer cannot log in",
    *,
    status: str = "awaiting_human_review",
    version: int = 1,
) -> tuple[CaseRecord, str]:
    repository = CaseRepository(session)
    record = repository.create(request_text, status=status)
    action_id = str(uuid4())
    state: dict[str, object] = {
        "case_id": str(record.id),
        "status": status,
        "version": version,
        "request_text": record.raw_request,
        "triage": {"priority": "P2", "category": "auth", "risk": "medium", "confidence": 0.9},
        "evidence": [],
        "resolution_brief": {
            "requester_facts": ["Original fact 1"],
            "evidence": [],
            "inferences": [],
            "missing_information": [],
            "proposed_actions": [
                {
                    "id": action_id,
                    "kind": ActionKind.CREATE_INCIDENT.value,
                    "payload_preview": "Create incident",
                    "risk": RiskLevel.HIGH.value,
                    "approval_required": True,
                    "state": ActionState.PROPOSED.value,
                }
            ],
            "reply_draft": "Original reply draft",
        },
        "provider": "deterministic_fallback",
    }
    repository.save_workflow_state(record.id, state)
    return record, action_id


def test_review_service_save_draft_and_optimistic_locking(
    sqlite_session_factory: sessionmaker[Session],
) -> None:
    with sqlite_session_factory() as session:
        record, _ = _seed_awaiting_case(session)
        service = ReviewService(CaseRepository(session))

        # 1. Save draft with expected_draft_version=0
        draft1 = ReviewDraftInput(
            actor="operator-1",
            priority=Priority.P1,
            reply_draft="Updated draft message",
            requester_facts=["Custom fact 1", "Custom fact 2"],
            comment="Work in progress comment",
        )
        saved_state = service.save_draft(record.id, draft1, expected_draft_version=0)
        assert saved_state["status"] == "awaiting_human_review"
        draft_dict = saved_state.get("review_draft")
        assert isinstance(draft_dict, dict)
        assert draft_dict["draft_version"] == 1
        assert draft_dict["actor"] == "operator-1"
        assert draft_dict["priority"] == "P1"
        assert draft_dict["reply_draft"] == "Updated draft message"
        assert draft_dict["requester_facts"] == ["Custom fact 1", "Custom fact 2"]
        assert draft_dict["comment"] == "Work in progress comment"

        # Verify no mock incident was created
        incidents = session.query(MockIncidentRecord).all()
        assert len(incidents) == 0

        # Verify audit event draft_saved was recorded
        events = CaseRepository(session).list_audit_events(record.id)
        saved_events = [e for e in events if e.event_type == "draft_saved"]
        assert len(saved_events) == 1
        assert saved_events[0].actor_id == "operator-1"

        # 2. Save next draft with expected_draft_version=1 -> succeeds with draft_version=2
        draft2 = ReviewDraftInput(
            actor="operator-1",
            priority=Priority.P1,
            reply_draft="Second iteration draft",
        )
        saved_state_2 = service.save_draft(record.id, draft2, expected_draft_version=1)
        draft_dict_2 = saved_state_2.get("review_draft")
        assert isinstance(draft_dict_2, dict)
        assert draft_dict_2["draft_version"] == 2
        assert draft_dict_2["reply_draft"] == "Second iteration draft"

        # 3. Save draft with stale expected_draft_version=1 -> raises ReviewConflictError
        with pytest.raises(ReviewConflictError, match="draft version mismatch"):
            service.save_draft(record.id, draft2, expected_draft_version=1)


def test_review_service_reset_draft(sqlite_session_factory: sessionmaker[Session]) -> None:
    with sqlite_session_factory() as session:
        record, _ = _seed_awaiting_case(session)
        service = ReviewService(CaseRepository(session))

        draft = ReviewDraftInput(
            actor="operator-1",
            priority=Priority.P1,
            reply_draft="Temporary draft",
        )
        service.save_draft(record.id, draft)

        reset_state = service.reset_draft(record.id, actor="operator-1", expected_draft_version=1)
        assert reset_state["review_draft"] is None

        with pytest.raises(ReviewConflictError, match="draft version mismatch"):
            service.reset_draft(record.id, actor="operator-1", expected_draft_version=1)
        assert reset_state["status"] == "awaiting_human_review"

        events = CaseRepository(session).list_audit_events(record.id)
        reset_events = [e for e in events if e.event_type == "draft_reset"]
        assert len(reset_events) == 1


def test_review_service_cannot_draft_on_terminal_case(
    sqlite_session_factory: sessionmaker[Session],
) -> None:
    with sqlite_session_factory() as session:
        record, _ = _seed_awaiting_case(session, status="completed")
        service = ReviewService(CaseRepository(session))

        draft = ReviewDraftInput(actor="operator-1", reply_draft="Draft on closed case")
        with pytest.raises(ReviewConflictError, match="terminal state"):
            service.save_draft(record.id, draft)

        with pytest.raises(ReviewConflictError, match="terminal state"):
            service.reset_draft(record.id, actor="operator-1")


def test_review_service_submit_clears_draft(sqlite_session_factory: sessionmaker[Session]) -> None:
    with sqlite_session_factory() as session:
        record, _ = _seed_awaiting_case(session)
        service = ReviewService(CaseRepository(session))

        draft = ReviewDraftInput(actor="operator-1", reply_draft="Draft before submit")
        service.save_draft(record.id, draft)

        # Submit final decision
        review = Review(
            actor="operator-1",
            edits=ReviewEdits(priority=Priority.P1, reply_draft="Final reply"),
            decision=ReviewDecision.APPROVE,
            reviewed_at=datetime.now(UTC),
        )
        state = service.submit(record.id, review, expected_version=1, idempotency_key="key-1")
        assert state["status"] == "completed"
        assert state.get("review_draft") is None


def test_api_save_draft_reload_and_reset(
    client: TestClient, sqlite_session_factory: sessionmaker[Session]
) -> None:
    with sqlite_session_factory() as session:
        record, _ = _seed_awaiting_case(session)
        case_id = str(record.id)

    # 1. PUT /cases/{case_id}/draft to save draft
    payload = {
        "actor": "operator-alice",
        "priority": "P1",
        "reply_draft": "Saved draft message",
        "requester_facts": ["Customer verified", "Network issue confirmed"],
        "comment": "Drafting response after investigation",
        "expected_draft_version": 0,
    }
    response = client.put(f"/cases/{case_id}/draft", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "awaiting_human_review"
    assert data["review_draft"] is not None
    assert data["review_draft"]["draft_version"] == 1
    assert data["review_draft"]["priority"] == "P1"
    assert data["review_draft"]["reply_draft"] == "Saved draft message"
    assert data["review_draft"]["comment"] == "Drafting response after investigation"

    # 2. GET /cases/{case_id} reloads the draft
    get_response = client.get(f"/cases/{case_id}")
    assert get_response.status_code == 200
    reloaded = get_response.json()
    assert reloaded["review_draft"] == data["review_draft"]

    # 3. PUT with mismatch expected_draft_version -> 409 Conflict
    stale_payload = {
        "actor": "operator-alice",
        "priority": "P2",
        "reply_draft": "Conflicting draft",
        "expected_draft_version": 0,  # current version is 1!
    }
    conflict_res = client.put(f"/cases/{case_id}/draft", json=stale_payload)
    assert conflict_res.status_code == 409
    assert conflict_res.json()["error"]["code"] == "conflict"
    assert "draft version mismatch" in conflict_res.json()["error"]["message"]

    # 4. DELETE /cases/{case_id}/draft resets draft
    del_res = client.delete(
        f"/cases/{case_id}/draft?actor=operator-alice&expected_draft_version=1"
    )
    assert del_res.status_code == 200
    assert del_res.json()["review_draft"] is None

    stale_reset = client.delete(
        f"/cases/{case_id}/draft?actor=operator-alice&expected_draft_version=1"
    )
    assert stale_reset.status_code == 409
    assert stale_reset.json()["error"]["code"] == "conflict"

    # 5. GET /cases/{case_id} shows draft is gone
    reloaded_after_reset = client.get(f"/cases/{case_id}").json()
    assert reloaded_after_reset["review_draft"] is None


def test_api_draft_404_on_missing_case(client: TestClient) -> None:
    fake_id = str(uuid4())
    res = client.put(
        f"/cases/{fake_id}/draft",
        json={"actor": "op", "reply_draft": "hello"},
    )
    assert res.status_code == 404

    del_res = client.delete(f"/cases/{fake_id}/draft")
    assert del_res.status_code == 404
