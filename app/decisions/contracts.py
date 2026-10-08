"""Decision-only contracts: model output is neither prose nor authorization."""

from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.domain.contracts import Evidence, Triage

NonnegativeMetric = Annotated[float, Field(ge=0, allow_inf_nan=False, strict=True)]
TokenCount = Annotated[int, Field(ge=0, strict=True)]


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
    actual_mode: Literal["llm", "jev", "deterministic_fallback"]
    uncertain: bool
    metadata: ModelCallMetadata


class DecisionService(Protocol):
    """Shared interface for a single decision path, independent of text generation."""

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult: ...
