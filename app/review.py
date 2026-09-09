"""Human review, policy enforcement, and mock execution orchestration."""

import hashlib
import json
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

from app.domain.contracts import ActorType, AuditEvent, Review, ReviewDecision
from app.persistence.repositories import CaseRepository


class CaseNotFoundError(Exception):
    """Raised when a requested case does not exist."""


class ReviewConflictError(Exception):
    """Raised when a review attempt conflicts with current version, state, or idempotency."""


def _review_fingerprint(review: Review) -> str:
    """Compute a deterministic hash of the human review input."""

    content = {
        "actor": review.actor,
        "decision": review.decision.value,
        "comment": review.comment,
        "edits": review.edits.model_dump(mode="json"),
    }
    serialized = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class ReviewService:
    """Apply persisted human decisions to a paused workflow checkpoint."""

    def __init__(self, repository: CaseRepository) -> None:
        self._repository = repository

    def submit(
        self,
        case_id: UUID,
        review: Review,
        *,
        expected_version: int,
        idempotency_key: str,
    ) -> dict[str, object]:
        """Persist edits and either reject or atomically execute an approved draft."""

        state = self._repository.load_workflow_state_for_update(case_id)
        if state is None:
            raise CaseNotFoundError("case not found")

        fingerprint = _review_fingerprint(review)
        persisted_idempotency_key = state.get("idempotency_key")
        if persisted_idempotency_key == idempotency_key:
            if state.get("review_fingerprint") == fingerprint:
                return state
            raise ReviewConflictError(
                "idempotency key already used with different review payload"
            )

        current_status = state.get("status")
        if current_status in {"completed", "rejected"}:
            raise ReviewConflictError(
                f"case is already in terminal state '{current_status}' and cannot be modified"
            )
        if current_status != "awaiting_human_review":
            raise ReviewConflictError(
                f"case is in state '{current_status}' and is not ready for review"
            )

        current_version = int(str(state.get("version", 1)))
        if expected_version != current_version:
            raise ReviewConflictError(
                f"version mismatch: expected {expected_version}, got {current_version}"
            )

        try:
            self._apply_edits(state, review)
            self._add_event(case_id, review, "review_recorded", "human_review", commit=False)
            if review.decision is ReviewDecision.REJECT:
                state["status"] = "rejected"
                self._set_actions(state, "rejected")
                self._add_event(case_id, review, "action_rejected", "policy_gate", commit=False)
            else:
                self._approve_and_execute(case_id, state, review, commit=False)

            state["version"] = current_version + 1
            state["idempotency_key"] = idempotency_key
            state["review_fingerprint"] = fingerprint
            state["review"] = review.model_dump(mode="json")
            self._repository.save_workflow_state(case_id, state, commit=False)
            self._repository.commit()
            return state
        except Exception:
            self._repository.rollback()
            raise

    def _approve_and_execute(
        self,
        case_id: UUID,
        state: dict[str, object],
        review: Review,
        *,
        commit: bool = True,
    ) -> None:
        brief = cast(dict[str, object], state["resolution_brief"])
        actions = [dict(item) for item in cast(list[dict[str, object]], brief["proposed_actions"])]
        action = self._incident_action(actions)
        action["state"] = "approved"
        self._add_event(case_id, review, "action_approved", "policy_gate", commit=commit)
        result, created = self._repository.execute_mock_incident(
            case_id=case_id,
            action_id=UUID(str(action["id"])),
            approval_id=review.id,
            commit=commit,
        )
        action["state"] = "executed"
        action["execution_result"] = result.model_dump(mode="json")
        brief["proposed_actions"] = actions
        state["resolution_brief"] = brief
        state["status"] = "completed"
        if created:
            self._add_event(
                case_id, review, "action_executed", "execute_mock_incident", commit=commit
            )

    @staticmethod
    def _incident_action(actions: list[dict[str, object]]) -> dict[str, object]:
        for action in actions:
            if action.get("kind") == "create_incident":
                return action
        raise ValueError("case has no incident proposal")

    @staticmethod
    def _set_actions(state: dict[str, object], action_state: str) -> None:
        brief = cast(dict[str, object], state["resolution_brief"])
        actions = [
            dict(action, state=action_state)
            for action in cast(list[dict[str, object]], brief["proposed_actions"])
        ]
        brief["proposed_actions"] = actions
        state["resolution_brief"] = brief

    @staticmethod
    def _apply_edits(state: dict[str, object], review: Review) -> None:
        triage = cast(dict[str, object], state["triage"])
        brief = cast(dict[str, object], state["resolution_brief"])
        if review.edits.priority is not None:
            triage["priority"] = review.edits.priority.value
        if review.edits.reply_draft is not None:
            brief["reply_draft"] = review.edits.reply_draft
        if review.edits.requester_facts is not None:
            brief["requester_facts"] = review.edits.requester_facts
        state["triage"] = triage
        state["resolution_brief"] = brief

    def _add_event(
        self,
        case_id: UUID,
        review: Review,
        event_type: str,
        name: str,
        *,
        commit: bool = True,
    ) -> None:
        event = AuditEvent(
            case_id=case_id,
            sequence=1,
            timestamp=datetime.now(UTC),
            event_type=event_type,
            actor_type=ActorType.OPERATOR,
            actor_id=review.actor,
            name=name,
            input_summary="review_input=metadata_only",
            output_summary=f"decision={review.decision.value}; approval_id={review.id}",
            correlation_id=uuid4(),
        )
        self._repository.add_audit_event(event, commit=commit)
