"""Unit tests for atomic review persistence, optimistic locking, and idempotency."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.domain.contracts import (
    ActionKind,
    ActionState,
    Priority,
    Review,
    ReviewDecision,
    ReviewEdits,
    RiskLevel,
)
from app.persistence.models import Base, MockIncidentRecord
from app.persistence.repositories import CaseRepository
from app.review import ReviewConflictError, ReviewService


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _seed_awaiting_case(repository: CaseRepository, version: int = 1) -> tuple[str, str]:
    case = repository.create("Portal login 500 error after update")
    action_id = str(uuid4())
    state: dict[str, object] = {
        "case_id": str(case.id),
        "status": "awaiting_human_review",
        "version": version,
        "request_text": case.raw_request,
        "triage": {"priority": "P1", "category": "auth", "risk": "high", "confidence": 0.95},
        "evidence": [],
        "resolution_brief": {
            "requester_facts": ["Cannot sign in"],
            "evidence": [],
            "inferences": [],
            "missing_information": [],
            "proposed_actions": [
                {
                    "id": action_id,
                    "kind": ActionKind.CREATE_INCIDENT.value,
                    "payload_preview": "Create incident in Engineering",
                    "risk": RiskLevel.HIGH.value,
                    "approval_required": True,
                    "state": ActionState.PROPOSED.value,
                }
            ],
            "reply_draft": "We are investigating.",
        },
        "provider": "deterministic_fallback",
    }
    repository.save_workflow_state(case.id, state)
    return str(case.id), action_id


def test_review_requires_matching_expected_version(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, _ = _seed_awaiting_case(repository, version=1)
        service = ReviewService(repository)

        review = Review(
            actor="operator@example.test",
            decision=ReviewDecision.APPROVE,
            reviewed_at=datetime.now(UTC),
        )

        with pytest.raises(ReviewConflictError, match="version mismatch"):
            service.submit(
                UUID(case_id_str),
                review,
                expected_version=99,
                idempotency_key="key-wrong-ver",
            )

        # Confirm case remains unchanged
        reloaded = repository.load_workflow_state(UUID(case_id_str))
        assert reloaded is not None
        assert reloaded["status"] == "awaiting_human_review"
        assert reloaded["version"] == 1


def test_successful_review_increments_version_and_records_idempotency(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, _ = _seed_awaiting_case(repository, version=1)
        case_id = UUID(case_id_str)
        service = ReviewService(repository)

        review = Review(
            actor="operator@example.test",
            decision=ReviewDecision.APPROVE,
            edits=ReviewEdits(priority=Priority.P2, reply_draft="Investigating actively."),
            reviewed_at=datetime.now(UTC),
        )

        state = service.submit(
            case_id,
            review,
            expected_version=1,
            idempotency_key="idem-key-1",
        )

        assert state["status"] == "completed"
        assert state["version"] == 2
        assert state["idempotency_key"] == "idem-key-1"
        assert state["review_fingerprint"] is not None


def test_idempotent_retry_returns_existing_result_without_duplicate_writes(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, _ = _seed_awaiting_case(repository, version=1)
        case_id = UUID(case_id_str)
        service = ReviewService(repository)

        review = Review(
            actor="operator@example.test",
            decision=ReviewDecision.APPROVE,
            reviewed_at=datetime.now(UTC),
        )

        first = service.submit(
            case_id, review, expected_version=1, idempotency_key="idem-key-retry"
        )
        first_events_count = len(repository.list_audit_events(case_id))

        # Retry with identical review payload and same key
        second = service.submit(
            case_id, review, expected_version=1, idempotency_key="idem-key-retry"
        )
        second_events_count = len(repository.list_audit_events(case_id))

        assert first == second
        assert first_events_count == second_events_count


def test_idempotent_key_with_different_payload_is_rejected(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, _ = _seed_awaiting_case(repository, version=1)
        case_id = UUID(case_id_str)
        service = ReviewService(repository)

        review1 = Review(
            actor="operator@example.test",
            decision=ReviewDecision.APPROVE,
            comment="Initial approval",
            reviewed_at=datetime.now(UTC),
        )
        service.submit(case_id, review1, expected_version=1, idempotency_key="shared-key")

        # Second attempt with different comment/payload using same key
        review2 = Review(
            actor="operator@example.test",
            decision=ReviewDecision.REJECT,
            comment="Changed mind to reject",
            reviewed_at=datetime.now(UTC),
        )
        with pytest.raises(ReviewConflictError, match="different review payload"):
            service.submit(case_id, review2, expected_version=1, idempotency_key="shared-key")


def test_terminal_state_cannot_be_re_reviewed(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, _ = _seed_awaiting_case(repository, version=1)
        case_id = UUID(case_id_str)
        service = ReviewService(repository)

        # Reject case
        review = Review(
            actor="operator@example.test",
            decision=ReviewDecision.REJECT,
            comment="Not a bug",
            reviewed_at=datetime.now(UTC),
        )
        service.submit(case_id, review, expected_version=1, idempotency_key="rej-key")

        # Attempt to approve already rejected case
        new_review = Review(
            actor="other@example.test",
            decision=ReviewDecision.APPROVE,
            reviewed_at=datetime.now(UTC),
        )
        with pytest.raises(ReviewConflictError, match="terminal state 'rejected'"):
            service.submit(
                case_id, new_review, expected_version=2, idempotency_key="attempt-reopen"
            )


def test_atomic_persistence_rolls_back_on_simulated_failure(session_factory) -> None:
    with session_factory() as session:
        repository = CaseRepository(session)
        case_id_str, action_id = _seed_awaiting_case(repository, version=1)
        case_id = UUID(case_id_str)
        initial_events = repository.list_audit_events(case_id)
        assert len(initial_events) == 0

        # Simulate a crash inside save_workflow_state right before commit
        def failing_save(*args, **kwargs):
            raise RuntimeError("Simulated DB checkpoint write failure")

        repository.save_workflow_state = failing_save  # type: ignore

        service = ReviewService(repository)
        review = Review(
            actor="operator@example.test",
            decision=ReviewDecision.APPROVE,
            reviewed_at=datetime.now(UTC),
        )

        with pytest.raises(RuntimeError, match="Simulated DB checkpoint write failure"):
            service.submit(case_id, review, expected_version=1, idempotency_key="fail-key")

    # In a fresh session, verify no partial state, no mock incident, and no review audit events
    with session_factory() as fresh_session:
        fresh_repo = CaseRepository(fresh_session)
        state = fresh_repo.load_workflow_state(case_id)
        assert state is not None
        assert state["status"] == "awaiting_human_review"
        assert state["version"] == 1

        events = fresh_repo.list_audit_events(case_id)
        assert len(events) == 0

        mock_incident = fresh_session.get(MockIncidentRecord, UUID(action_id))
        assert mock_incident is None
