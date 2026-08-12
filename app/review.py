"""Human review, policy enforcement, and mock execution orchestration."""

from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

from app.domain.contracts import ActorType, AuditEvent, Review, ReviewDecision
from app.persistence.repositories import CaseRepository


class ReviewService:
    """Apply persisted human decisions to a paused workflow checkpoint."""

    def __init__(self, repository: CaseRepository) -> None:
        self._repository = repository

    def submit(self, case_id: UUID, review: Review) -> dict[str, object]:
        """Persist edits and either reject or atomically execute an approved draft."""

        state = self._repository.load_workflow_state(case_id)
        if state is None:
            raise ValueError("case not found")
        if state.get("status") not in {"awaiting_human_review", "completed", "rejected"}:
            raise ValueError("case is not ready for review")

        self._apply_edits(state, review)
        self._add_event(case_id, review, "review_recorded", "human_review")
        if review.decision is ReviewDecision.REJECT:
            state["status"] = "rejected"
            self._set_actions(state, "rejected")
            self._add_event(case_id, review, "action_rejected", "policy_gate")
        else:
            self._approve_and_execute(case_id, state, review)
        state["review"] = review.model_dump(mode="json")
        self._repository.save_workflow_state(case_id, state)
        return state

    def _approve_and_execute(self, case_id: UUID, state: dict[str, object], review: Review) -> None:
        brief = cast(dict[str, object], state["resolution_brief"])
        actions = [dict(item) for item in cast(list[dict[str, object]], brief["proposed_actions"])]
        action = self._incident_action(actions)
        action["state"] = "approved"
        self._add_event(case_id, review, "action_approved", "policy_gate")
        result, created = self._repository.execute_mock_incident(
            case_id=case_id, action_id=UUID(str(action["id"])), approval_id=review.id
        )
        action["state"] = "executed"
        action["execution_result"] = result.model_dump(mode="json")
        brief["proposed_actions"] = actions
        state["resolution_brief"] = brief
        state["status"] = "completed"
        if created:
            self._add_event(case_id, review, "action_executed", "execute_mock_incident")

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

    def _add_event(self, case_id: UUID, review: Review, event_type: str, name: str) -> None:
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
        self._repository.add_audit_event(event)
