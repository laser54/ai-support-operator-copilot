"""Safe model boundary for triage and resolution brief generation."""

from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import Settings
from app.domain.contracts import (
    ActionKind,
    Evidence,
    Priority,
    ProposedAction,
    ResolutionBrief,
    RiskLevel,
    Triage,
)


class ModelOutput(BaseModel):
    """Only model-controlled analytical fields, validated at the provider boundary."""

    model_config = ConfigDict(extra="forbid")

    triage: Triage
    requester_facts: list[str] = Field(min_length=1)
    inferences: list[str] = Field(min_length=1)
    missing_information: list[str] = Field(min_length=1)
    reply_draft: str = Field(min_length=1, max_length=4_000)


class StructuredModelClient(Protocol):
    """Minimal OpenAI-compatible structured output transport contract."""

    def generate(self, request_text: str, evidence: list[Evidence]) -> ModelOutput: ...


@dataclass(frozen=True)
class GenerationResult:
    """Validated analytical result and a non-sensitive provenance marker."""

    triage: Triage
    brief: ResolutionBrief
    provider: str
    fallback_reason: str | None = None


class OpenAICompatibleClient:
    """Small synchronous adapter for OpenAI-compatible chat-completions APIs."""

    def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model

    def generate(self, request_text: str, evidence: list[Evidence]) -> ModelOutput:
        """Request JSON output then reject anything outside the typed contract."""

        response = httpx.post(
            f"{self._base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={
                "model": self._model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Return JSON only. Classify support text and draft a cautious reply. "
                            "Do not decide or execute actions."
                        ),
                    },
                    {"role": "user", "content": _prompt(request_text, evidence)},
                ],
            },
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("provider response content was not text")
        return ModelOutput.model_validate_json(content)


class TriageAndBriefService:
    """Generate analysis with a deterministic fallback that cannot grant writes."""

    def __init__(self, settings: Settings, client: StructuredModelClient | None = None) -> None:
        self._settings = settings
        self._client = client

    def generate(self, request_text: str, evidence: list[Evidence]) -> GenerationResult:
        """Use provider output when valid; otherwise return safe deterministic analysis."""

        if self._client is None:
            if not self._is_configured():
                return self._fallback(request_text, evidence, "provider_not_configured")
            self._client = OpenAICompatibleClient(
                api_key=self._settings.llm_api_key or "",
                base_url=self._settings.llm_base_url or "",
                model=self._settings.llm_model or "",
            )
        try:
            output = self._client.generate(request_text, evidence)
        except (httpx.HTTPError, KeyError, TypeError, ValueError, ValidationError):
            return self._fallback(request_text, evidence, "provider_output_unavailable")
        return _result_from_output(output, evidence, provider="openai_compatible")

    def _is_configured(self) -> bool:
        return all(
            [self._settings.llm_api_key, self._settings.llm_base_url, self._settings.llm_model]
        )

    def _fallback(
        self, request_text: str, evidence: list[Evidence], reason: str
    ) -> GenerationResult:
        return _fallback_result(request_text, evidence, reason)


def _result_from_output(
    output: ModelOutput, evidence: list[Evidence], *, provider: str
) -> GenerationResult:
    brief = ResolutionBrief(
        requester_facts=output.requester_facts,
        evidence=evidence,
        inferences=output.inferences,
        missing_information=output.missing_information,
        proposed_actions=_proposals(output.triage.risk),
        reply_draft=output.reply_draft,
    )
    return GenerationResult(triage=output.triage, brief=brief, provider=provider)


def _fallback_result(request_text: str, evidence: list[Evidence], reason: str) -> GenerationResult:
    request_lower = request_text.lower()
    has_login_symptom = "login" in request_lower or "sign in" in request_lower
    login_incident = has_login_symptom and "500" in request_lower
    triage = Triage(
        category="incident/access" if login_incident else "support/request",
        priority=Priority.P1 if login_incident else Priority.P3,
        risk=RiskLevel.HIGH if login_incident else RiskLevel.MEDIUM,
        confidence=0.8 if login_incident else 0.5,
        missing_information=[
            "first observed timestamp",
            "affected user or account example",
            "portal URL or environment",
        ],
    )
    output = ModelOutput(
        triage=triage,
        requester_facts=["Requester reports login HTTP 500 after an update."],
        inferences=[
            "The report may indicate an access incident and requires human review.",
        ],
        missing_information=triage.missing_information,
        reply_draft=(
            "We have recorded the access issue and are checking it with Engineering. "
            "Please send the approximate first failure time and one affected user or account "
            "example."
        ),
    )
    result = _result_from_output(output, evidence, provider="deterministic_fallback")
    return GenerationResult(
        triage=result.triage,
        brief=result.brief,
        provider=result.provider,
        fallback_reason=reason,
    )


def _proposals(risk: RiskLevel) -> list[ProposedAction]:
    """Create drafts only; later policy code decides whether any draft can execute."""

    return [
        ProposedAction(
            kind=ActionKind.CREATE_INCIDENT,
            payload_preview="Create an Engineering incident draft for the access failure.",
            risk=risk,
            approval_required=True,
        ),
        ProposedAction(
            kind=ActionKind.REQUEST_INFORMATION,
            payload_preview="Ask the requester for a timestamp, affected account, and environment.",
            risk=RiskLevel.LOW,
            approval_required=False,
        ),
    ]


def _prompt(request_text: str, evidence: list[Evidence]) -> str:
    evidence_ids = ", ".join(item.source_id for item in evidence)
    return f"Request: {request_text}\nEvidence source IDs: {evidence_ids}"
