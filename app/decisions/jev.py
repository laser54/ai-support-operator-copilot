"""Dedicated synchronous Jev System One transport, independent of chat completion.

OpenRouter is the transport; response.provider is the actual inference provider.
Only validated finite decisions are returned. Neither probabilities nor this
adapter generate prose, make proposals, grant permissions, or execute writes.
No raw request, provider payload, credential, or exception is logged or returned.
"""

import json
import math
from time import perf_counter
from typing import Annotated, Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.config import Settings
from app.decisions.contracts import DecisionResult, ModelCallMetadata, NonnegativeMetric, Usage
from app.decisions.rubric import (
    CATEGORY_CRITERIA,
    DEFAULT_ENDPOINT,
    DEFAULT_MODEL,
    DEFAULT_TIMEOUT_SECONDS,
    DISTRIBUTION_TOLERANCE,
    HUMAN_REVIEW_INFORMATION,
    PRIORITY_CRITERIA,
    PRIORITY_LEVELS,
    REVIEW_NEEDED_THRESHOLD,
    RISK_CRITERIA,
    RUBRIC_VERSION,
    SCORE_TOLERANCE,
    UNCERTAINTY_THRESHOLD,
    decision_questions,
    priority_index,
)
from app.domain.contracts import Evidence, Priority, RiskLevel, Triage

Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)]


class _ProviderModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Choice(_ProviderModel):
    type: Literal["choice"]
    choice: str
    probabilities: dict[str, Probability]
    confidence: Probability


class _Score(_ProviderModel):
    type: Literal["score"]
    score: Annotated[float, Field(ge=0, le=3, allow_inf_nan=False, strict=True)]
    legend: dict[str, str]
    probabilities: dict[str, Probability]
    confidence: Probability


class _Noul(_ProviderModel):
    type: Literal["noul"]
    noul: Probability


def _validate_distribution(probabilities: dict[str, float], keys: set[str]) -> None:
    if set(probabilities) != keys:
        raise ValueError("distribution options do not match rubric")
    if not math.isclose(math.fsum(probabilities.values()), 1.0,
                        rel_tol=0, abs_tol=DISTRIBUTION_TOLERANCE):
        raise ValueError("distribution is not normalized")


def _validate_choice(answer: _Choice, options: set[str]) -> None:
    _validate_distribution(answer.probabilities, options)
    if answer.choice not in options:
        raise ValueError("choice is outside rubric")
    if answer.probabilities[answer.choice] != max(answer.probabilities.values()):
        raise ValueError("choice does not match distribution winner")
    # Confidence is a separate provider signal, not necessarily winner probability.


class _Answers(_ProviderModel):
    category: _Choice
    priority: _Score
    risk: _Choice
    review_needed: _Noul

    @model_validator(mode="after")
    def validate_rubric(self) -> "_Answers":
        _validate_choice(self.category, set(CATEGORY_CRITERIA))
        _validate_choice(self.risk, set(RISK_CRITERIA))
        legend = {str(i): text for i, text in enumerate(PRIORITY_CRITERIA)}
        if self.priority.legend != legend:
            raise ValueError("score legend does not match rubric")
        _validate_distribution(self.priority.probabilities, set(legend))
        expected = math.fsum(int(key) * value for key, value in self.priority.probabilities.items())
        if not math.isclose(self.priority.score, expected, rel_tol=0, abs_tol=SCORE_TOLERANCE):
            raise ValueError("score is not the distribution expected value")
        return self


class _ProviderUsage(Usage):
    cost: NonnegativeMetric | None = None


class _Response(_ProviderModel):
    id: str | None = Field(default=None, min_length=1, max_length=200)
    model: str = Field(pattern=r"^typesafe/jev-1\.13(?:-[0-9]{8})?$")
    # Only the reviewed backend is accepted; arbitrary text must not enter provenance.
    provider: Literal["TypeSafe"] | None = None
    answers: _Answers
    usage: _ProviderUsage | None = None


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Reject duplicate JSON keys instead of silently keeping a conflicting last value."""

    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate response key")
        result[key] = value
    return result


def _fallback(reason: str, model: str | None, elapsed_ms: float | None = None) -> DecisionResult:
    return DecisionResult(
        triage=Triage(
            category="uncertain/review",
            priority=Priority.P3,
            risk=RiskLevel.HIGH,
            confidence=0,
            missing_information=[HUMAN_REVIEW_INFORMATION],
        ),
        actual_mode="deterministic_fallback",
        uncertain=True,
        metadata=ModelCallMetadata(
            provider="deterministic_fallback",
            requested_model=model,
            fallback_reason=reason,
            wall_time_ms=elapsed_ms,
            rubric_version=RUBRIC_VERSION,
        ),
    )


def _has_tied_winner(probabilities: dict[str, float]) -> bool:
    maximum = max(probabilities.values())
    return sum(value == maximum for value in probabilities.values()) > 1


def _decision(response: _Response, requested_model: str, elapsed_ms: float) -> DecisionResult:
    answers = response.answers
    index = priority_index(answers.priority.score)
    # Conservative weakest-signal heuristic, not a calibrated accuracy estimate.
    confidence = min(
        answers.category.confidence,
        answers.category.probabilities[answers.category.choice],
        answers.priority.confidence,
        answers.priority.probabilities[str(index)],
        answers.risk.confidence,
        answers.risk.probabilities[answers.risk.choice],
        1 - answers.review_needed.noul,
    )
    uncertain = (
        answers.category.choice == "uncertain/review"
        or confidence < UNCERTAINTY_THRESHOLD
        or answers.review_needed.noul >= REVIEW_NEEDED_THRESHOLD
        or any(_has_tied_winner(answer.probabilities)
               for answer in (answers.category, answers.priority, answers.risk))
    )
    usage = response.usage
    cost = usage.cost if usage is not None else None
    return DecisionResult(
        triage=Triage(
            category=answers.category.choice,
            priority=PRIORITY_LEVELS[index],
            risk=RiskLevel(answers.risk.choice),
            confidence=confidence,
            missing_information=[HUMAN_REVIEW_INFORMATION] if uncertain else [],
        ),
        actual_mode="jev",
        uncertain=uncertain,
        metadata=ModelCallMetadata(
            provider=f"openrouter/{response.provider or 'unknown'}",
            model=response.model,
            requested_model=requested_model,
            # A resolved identifier is retained verbatim; no separate version is invented.
            wall_time_ms=elapsed_ms,
            usage=Usage(input_tokens=usage.input_tokens, output_tokens=usage.output_tokens)
            if usage is not None else None,
            cost=cost,
            cost_source="provider_usage" if cost is not None else "unknown",
            rubric_version=RUBRIC_VERSION,
        ),
    )


class JevClient:
    """One dedicated, timeout-bounded POST; failure means review, never an LLM retry."""

    def __init__(
        self,
        api_key: str | None,
        endpoint: str = DEFAULT_ENDPOINT,
        model: str = DEFAULT_MODEL,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._endpoint = endpoint
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._transport = transport

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult:
        """Validate full typed answers before mapping; return only bounded failure causes."""

        started = perf_counter()

        def failed(reason: str) -> DecisionResult:
            return _fallback(reason, self._model, (perf_counter() - started) * 1000)

        if not self._api_key or not self._api_key.strip():
            return failed("jev_not_configured")
        if (self._endpoint != DEFAULT_ENDPOINT or self._model != DEFAULT_MODEL
                or not math.isfinite(self._timeout_seconds)
                or self._timeout_seconds <= 0):
            return failed("jev_not_configured")
        try:
            with httpx.Client(
                transport=self._transport,
                timeout=self._timeout_seconds,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                response = client.post(
                    self._endpoint,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={
                        "model": self._model,
                        "state": {
                            "request": request_text,
                            "evidence": [
                                {"source_id": item.source_id,
                                 "source_type": item.source_type.value,
                                 "excerpt": item.excerpt}
                                for item in evidence
                            ],
                        },
                        "questions": decision_questions(),
                    },
                )
            if not 200 <= response.status_code < 300:
                return failed(f"jev_http_{response.status_code}")
            payload = json.loads(response.content, object_pairs_hook=_unique_object)
            parsed = _Response.model_validate(payload)
            return _decision(parsed, self._model, (perf_counter() - started) * 1000)
        except httpx.TimeoutException:
            return failed("jev_timeout")
        except (httpx.HTTPError, httpx.InvalidURL):
            return failed("jev_transport_error")
        except (ValueError, TypeError, UnicodeError, RecursionError):
            return failed("jev_invalid_output")


class JevDecisionService:
    """Backend-only configuration boundary; LLM credentials are deliberately ignored."""

    def __init__(self, settings: Settings, client: JevClient | None = None) -> None:
        self._settings = settings
        self._client = client

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult:
        """Run only the chosen Jev path, with a safe deterministic review fallback."""

        if self._client is None:
            self._client = JevClient(
                api_key=self._settings.jev_api_key,
                timeout_seconds=self._settings.jev_timeout_seconds,
            )
        return self._client.decide(request_text, evidence)
