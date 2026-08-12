"""Tests for the validated model boundary and deterministic fallback."""

from app.config import Settings
from app.domain.contracts import (
    ActionState,
    Evidence,
    EvidenceSourceType,
    Priority,
    RiskLevel,
    Triage,
)
from app.llm.service import ModelOutput, TriageAndBriefService


class ValidClient:
    def generate(self, request_text: str, evidence: list[Evidence]) -> ModelOutput:
        del request_text, evidence
        return ModelOutput(
            triage=Triage(
                category="incident/access",
                priority=Priority.P1,
                risk=RiskLevel.HIGH,
                confidence=0.9,
                missing_information=["first observed timestamp"],
            ),
            requester_facts=["Requester reports a portal login error."],
            inferences=["The incident may affect access."],
            missing_information=["first observed timestamp"],
            reply_draft="We are investigating the login failure.",
        )


class InvalidClient:
    def generate(self, request_text: str, evidence: list[Evidence]) -> ModelOutput:
        del request_text, evidence
        raise ValueError("invalid structured output")


def test_missing_credentials_uses_deterministic_login_500_fallback() -> None:
    result = TriageAndBriefService(Settings()).generate(
        "After the update, employees cannot login and see HTTP 500.", []
    )

    assert result.provider == "deterministic_fallback"
    assert result.fallback_reason == "provider_not_configured"
    assert result.triage.priority is Priority.P1
    assert all(action.state is ActionState.PROPOSED for action in result.brief.proposed_actions)
    assert all(not hasattr(action, "execute") for action in result.brief.proposed_actions)


def test_valid_configured_client_returns_validated_typed_output() -> None:
    result = TriageAndBriefService(Settings(), client=ValidClient()).generate(
        "Portal login HTTP 500", []
    )

    assert result.provider == "openai_compatible"
    assert result.triage.priority is Priority.P1
    assert result.brief.reply_draft == "We are investigating the login failure."


def test_invalid_provider_output_uses_fallback_without_exposing_error_details() -> None:
    evidence = [
        Evidence(
            source_type=EvidenceSourceType.KNOWLEDGE,
            source_id="kb-auth-5xx-after-release",
            excerpt="Synthetic runbook.",
            tool_name="search_knowledge",
            observed_at="2026-08-12T10:45:00Z",
        )
    ]

    result = TriageAndBriefService(Settings(), client=InvalidClient()).generate(
        "login 500", evidence
    )

    assert result.provider == "deterministic_fallback"
    assert result.fallback_reason == "provider_output_unavailable"
    assert "invalid structured output" not in (result.fallback_reason or "")
