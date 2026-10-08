"""Decision-only contracts: model output is neither prose nor authorization."""

from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.domain.contracts import Evidence, Triage

NonnegativeMetric = Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)]
TokenCount = Annotated[int, Field(ge=0, strict=True)]
TriageMode = Literal["llm", "jev"]
ActualMode = Literal["llm", "jev", "deterministic_fallback"]


class Usage(BaseModel):
    """Actual provider token counts; missing measurements stay unknown."""

    model_config = ConfigDict(extra="forbid")

    input_tokens: TokenCount | None = None
    output_tokens: TokenCount | None = None


class CostEstimate(BaseModel):
    """An estimate, never a provider invoice or a replacement for reported cost."""

    model_config = ConfigDict(extra="forbid")

    amount: NonnegativeMetric
    currency: Literal["USD"]
    source: Literal["versioned_price_table_estimate"]
    price_table_version: str
    priced_provider: str
    priced_model: str
    input_usd_per_million_tokens: NonnegativeMetric
    output_usd_per_million_tokens: NonnegativeMetric


class ModelCallMetadata(BaseModel):
    """Non-sensitive provenance for one decision or generation call."""

    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=1, max_length=200)
    model: str | None = Field(default=None, max_length=200)
    requested_model: str | None = Field(default=None, max_length=200)
    model_version: str | None = Field(default=None, max_length=200)
    fallback_reason: str | None = Field(default=None, max_length=100)
    wall_time_ms: NonnegativeMetric | None = None
    provider_latency_ms: NonnegativeMetric | None = None
    usage: Usage | None = None
    cost: NonnegativeMetric | None = None
    cost_source: str = "unknown"
    cost_estimate: CostEstimate | None = None
    rubric_version: str | None = Field(default=None, max_length=100)


class DecisionResult(BaseModel):
    """A narrow triage prediction and its actual execution path."""

    model_config = ConfigDict(extra="forbid")

    triage: Triage
    actual_mode: ActualMode
    uncertain: bool
    metadata: ModelCallMetadata
    # Internal transport observation, exposed separately in AnalysisProvenance;
    # keep the existing decision-only serialization shape unchanged.
    attempt_metadata: ModelCallMetadata | None = Field(default=None, exclude=True)


class AnalysisProvenance(BaseModel):
    """Per-run selection and separate generators; absent legacy data stays unknown."""

    model_config = ConfigDict(extra="forbid")

    triage_mode: TriageMode | None = None
    actual_mode: ActualMode | None = None
    uncertain: bool | None = None
    decision_metadata: ModelCallMetadata | None = None
    prose_provider: str | None = None
    prose_model: str | None = None
    prose_fallback_reason: str | None = None
    prose_metadata: ModelCallMetadata | None = None
    decision_attempt_metadata: ModelCallMetadata | None = None
    prose_attempt_metadata: ModelCallMetadata | None = None
    decision_wall_time_ms: NonnegativeMetric | None = None
    prose_generation_wall_time_ms: NonnegativeMetric | None = None
    analysis_wall_time_ms: NonnegativeMetric | None = None
    generation_call_scope: Literal[
        "shared_triage_and_prose", "separate_decision_and_prose"
    ] | None = None


PROVENANCE_KEYS = tuple(AnalysisProvenance.model_fields)


class DecisionService(Protocol):
    """Shared interface for a single decision path, independent of text generation."""

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult: ...
