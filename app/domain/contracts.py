"""Pydantic contracts at the workflow and tool boundaries."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class CaseStatus(StrEnum):
    """Lifecycle states that may be persisted for a case."""

    RECEIVED = "received"
    AWAITING_HUMAN_REVIEW = "awaiting_human_review"
    REJECTED = "rejected"
    COMPLETED = "completed"


class Priority(StrEnum):
    """Supported incident priorities."""

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class RiskLevel(StrEnum):
    """Risk levels used for proposed actions."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class EvidenceSourceType(StrEnum):
    """Bounded types of evidence returned by the fixture tools."""

    KNOWLEDGE = "knowledge"
    SIMILAR_CASE = "similar_case"
    SERVICE_STATUS = "service_status"


class ActionKind(StrEnum):
    """Actions supported by the MVP workflow."""

    CREATE_INCIDENT = "create_incident"
    REQUEST_INFORMATION = "request_information"


class ActionState(StrEnum):
    """Lifecycle states for an action proposal."""

    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"


class ReviewDecision(StrEnum):
    """Human decisions accepted at the review gate."""

    APPROVE = "approve"
    REJECT = "reject"


class ActorType(StrEnum):
    """Actor categories represented in the audit trace."""

    SYSTEM = "system"
    OPERATOR = "operator"
    TOOL = "tool"


class ExecutionState(StrEnum):
    """Recorded outcome of a mock action execution."""

    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RECONCILIATION_REQUIRED = "reconciliation_required"


class Triage(BaseModel):
    """Structured classification of the requester report."""

    model_config = ConfigDict(extra="forbid")

    category: str = Field(min_length=1, max_length=80)
    priority: Priority
    risk: RiskLevel
    confidence: float = Field(ge=0, le=1)
    missing_information: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(
        default_factory=list
    )


class Evidence(BaseModel):
    """Traceable output from a read-only source."""

    model_config = ConfigDict(extra="forbid")

    source_type: EvidenceSourceType
    source_id: str = Field(pattern=r"^[a-z][a-z0-9_-]{2,63}$")
    excerpt: str = Field(min_length=1, max_length=2_000)
    tool_name: str = Field(min_length=1, max_length=100)
    observed_at: datetime
    source_url: HttpUrl | None = None


class ProposedAction(BaseModel):
    """A non-executed action proposal that remains subject to policy."""

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    kind: ActionKind
    payload_preview: str = Field(min_length=1, max_length=2_000)
    risk: RiskLevel
    approval_required: bool
    state: ActionState = ActionState.PROPOSED


class ResolutionBrief(BaseModel):
    """Reviewable separation of facts, evidence, inference, and next steps."""

    model_config = ConfigDict(extra="forbid")

    requester_facts: list[Annotated[str, Field(min_length=1, max_length=1_000)]]
    evidence: list[Evidence]
    inferences: list[Annotated[str, Field(min_length=1, max_length=1_000)]]
    missing_information: list[Annotated[str, Field(min_length=1, max_length=500)]]
    proposed_actions: list[ProposedAction]
    reply_draft: str = Field(min_length=1, max_length=4_000)


class ReviewEdits(BaseModel):
    """Permitted edits supplied by a human operator."""

    model_config = ConfigDict(extra="forbid")

    priority: Priority | None = None
    reply_draft: str | None = Field(default=None, min_length=1, max_length=4_000)
    requester_facts: list[Annotated[str, Field(min_length=1, max_length=1_000)]] | None = None


class Review(BaseModel):
    """Persistable human review record."""

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    actor: str = Field(min_length=1, max_length=255)
    edits: ReviewEdits = Field(default_factory=ReviewEdits)
    decision: ReviewDecision
    comment: str | None = Field(default=None, max_length=2_000)
    reviewed_at: datetime


class AuditEvent(BaseModel):
    """Ordered, safe summary of a workflow, tool, review, or execution event."""

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    case_id: UUID
    sequence: int = Field(ge=1)
    timestamp: datetime
    event_type: str = Field(min_length=1, max_length=100)
    actor_type: ActorType
    actor_id: str | None = Field(default=None, max_length=255)
    name: str = Field(min_length=1, max_length=100)
    input_summary: str = Field(min_length=1, max_length=2_000)
    output_summary: str = Field(min_length=1, max_length=2_000)
    correlation_id: UUID


class ExecutionResult(BaseModel):
    """Result recorded by the mock executor without implying a real side effect."""

    model_config = ConfigDict(extra="forbid")

    action_id: UUID
    approval_id: UUID
    state: ExecutionState
    external_reference: str | None = Field(default=None, max_length=255)
    message: str = Field(min_length=1, max_length=2_000)
    executed_at: datetime

    @model_validator(mode="after")
    def require_reference_for_success(self) -> "ExecutionResult":
        """Require a mock ticket reference for a successful execution."""

        if self.state is ExecutionState.SUCCEEDED and self.external_reference is None:
            raise ValueError("external_reference is required when execution succeeds")
        return self


class Case(BaseModel):
    """Complete typed workflow case contract used after intake is implemented."""

    model_config = ConfigDict(extra="forbid")

    id: UUID = Field(default_factory=uuid4)
    raw_request: str = Field(min_length=1, max_length=10_000)
    status: CaseStatus = CaseStatus.RECEIVED
    created_at: datetime
    updated_at: datetime
    requester_facts: list[Annotated[str, Field(min_length=1, max_length=1_000)]] = Field(
        default_factory=list
    )
    triage: Triage | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    resolution_brief: ResolutionBrief | None = None
    proposed_actions: list[ProposedAction] = Field(default_factory=list)
    final_reply: str | None = Field(default=None, max_length=4_000)
    review: Review | None = None
