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


class ModelCallMetadata(BaseModel):
    """Non-sensitive provenance for one decision or generation call."""

    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=1, max_length=200)
    model: str | None = Field(default=None, max_length=200)
    requested_model: str | None = Field(default=None, max_length=200)
    model_version: str | None = Field(default=None, max_length=200)
    fallback_reason: str | None = Field(default=None, max_length=100)
    wall_time_ms: NonnegativeMetric | None = None
    usage: Usage | None = None
    cost: NonnegativeMetric | None = None
    cost_source: str = "unknown"
    rubric_version: str | None = Field(default=None, max_length=100)


class DecisionResult(BaseModel):
    """A narrow triage prediction and its actual execution path."""

    model_config = ConfigDict(extra="forbid")

    triage: Triage
    actual_mode: ActualMode
    uncertain: bool
    metadata: ModelCallMetadata


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


PROVENANCE_KEYS = tuple(AnalysisProvenance.model_fields)


class DecisionService(Protocol):
    """Shared interface for a single decision path, independent of text generation."""

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult: ...
