"""Behavioral validation tests for typed workflow contracts."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.domain.contracts import (
    ActionKind,
    Evidence,
    EvidenceSourceType,
    ExecutionResult,
    ExecutionState,
    Priority,
    ProposedAction,
    RiskLevel,
    Triage,
)


def test_contracts_accept_a_typed_login_500_case_components() -> None:
    triage = Triage(
        category="incident/access",
        priority=Priority.P1,
        risk=RiskLevel.HIGH,
        confidence=0.9,
        missing_information=["first observed timestamp"],
    )
    evidence = Evidence(
        source_type=EvidenceSourceType.KNOWLEDGE,
        source_id="kb-auth-5xx-after-release",
        excerpt="Login HTTP 500 after a release requires Engineering routing.",
        tool_name="search_knowledge",
        observed_at=datetime(2026, 8, 12, 10, 45, tzinfo=UTC),
    )
    action = ProposedAction(
        kind=ActionKind.CREATE_INCIDENT,
        payload_preview="Create an Engineering incident draft.",
        risk=RiskLevel.HIGH,
        approval_required=True,
    )

    assert triage.priority is Priority.P1
    assert evidence.source_id == "kb-auth-5xx-after-release"
    assert action.approval_required is True


def test_contracts_reject_invalid_priority_and_untraceable_evidence() -> None:
    with pytest.raises(ValidationError):
        Triage(category="incident", priority="urgent", risk="high", confidence=1.2)

    with pytest.raises(ValidationError):
        Evidence(
            source_type=EvidenceSourceType.KNOWLEDGE,
            source_id="not valid",
            excerpt="Evidence must have a stable source identifier.",
            tool_name="search_knowledge",
            observed_at=datetime(2026, 8, 12, tzinfo=UTC),
        )


def test_successful_execution_requires_a_mock_reference() -> None:
    with pytest.raises(ValidationError, match="external_reference"):
        ExecutionResult(
            action_id=uuid4(),
            approval_id=uuid4(),
            state=ExecutionState.SUCCEEDED,
            message="Mock incident created.",
            executed_at=datetime(2026, 8, 12, tzinfo=UTC),
        )
