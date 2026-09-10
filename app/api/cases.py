"""Case intake and retrieval endpoints."""

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.domain.contracts import (
    AuditEvent,
    CaseStatus,
    Priority,
    Review,
    ReviewDecision,
    ReviewEdits,
)
from app.graph.workflow import CaseWorkflow
from app.llm.service import TriageAndBriefService
from app.persistence.database import get_session
from app.persistence.repositories import CaseRepository
from app.rate_limit import IntakeRateLimiter, client_id_from_request
from app.review import CaseNotFoundError, ReviewConflictError, ReviewDraftInput, ReviewService

router = APIRouter(prefix="/cases", tags=["cases"])


class CreateCaseRequest(BaseModel):
    """Free-text support intake request."""

    model_config = ConfigDict(extra="forbid")

    request_text: str = Field(min_length=1, max_length=10_000)


class AddClarificationRequest(BaseModel):
    """Add supplementary context to a case and re-trigger analysis."""

    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=10_000)
    author: str = Field(default="requester", min_length=1, max_length=255)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=255)
    discard_draft: bool = Field(default=True)

    @field_validator("text")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("clarification text cannot be empty or blank")
        return value


class CaseResponse(BaseModel):
    """Persisted workflow state exposed by the API."""

    model_config = ConfigDict(extra="forbid")

    case_id: UUID
    status: str
    version: int = Field(default=1, ge=1, description="Current monotonic case state version")
    request_text: str
    triage: dict[str, object]
    evidence: list[dict[str, object]]
    resolution_brief: dict[str, object]
    provider: str
    fallback_reason: str | None = None
    model: str | None = None
    review: dict[str, object] | None = None
    review_draft: dict[str, object] | None = None
    clarifications: list[dict[str, object]] = Field(default_factory=list)
    revisions: list[dict[str, object]] = Field(default_factory=list)
    current_revision: int = Field(default=1, ge=1)


class ReviewRequest(BaseModel):
    """Human correction and approval/rejection decision with optimistic concurrency control."""

    model_config = ConfigDict(extra="forbid")

    actor: str = Field(min_length=1, max_length=255)
    edits: ReviewEdits = Field(default_factory=ReviewEdits)
    decision: ReviewDecision
    comment: str | None = Field(default=None, max_length=2_000)
    expected_version: int = Field(
        ge=1,
        description="Optimistic locking version expected by client. Mismatch returns 409.",
    )
    idempotency_key: str = Field(
        min_length=1,
        max_length=255,
        description="Unique client-provided key ensuring idempotent review processing.",
    )


class SaveDraftRequest(BaseModel):
    """Operator draft edits to save without submitting a final decision."""

    model_config = ConfigDict(extra="forbid")

    actor: str = Field(min_length=1, max_length=255)
    priority: Priority | None = None
    reply_draft: str | None = Field(default=None, max_length=4_000)
    requester_facts: list[str] | None = None
    comment: str | None = Field(default=None, max_length=2_000)
    expected_draft_version: int | None = Field(
        default=None,
        ge=0,
        description="Optimistic locking draft version. None/0 matches initial state.",
    )


class TraceResponse(BaseModel):
    """Ordered persisted audit trace for one case."""

    case_id: UUID
    events: list[AuditEvent]


def _response(state: dict[str, object]) -> CaseResponse:
    revisions = cast(list[dict[str, object]], state.get("revisions"))
    if not revisions:
        revisions = [
            {
                "revision_number": 1,
                "created_at": str(state.get("created_at") or datetime.now(UTC).isoformat()),
                "triggered_by": "intake",
                "clarification_id": None,
                "triage": state.get("triage") or {},
                "evidence": state.get("evidence") or [],
                "resolution_brief": state.get("resolution_brief") or {},
                "provider": str(state.get("provider") or "deterministic_fallback"),
                "fallback_reason": state.get("fallback_reason"),
                "model": state.get("model"),
            }
        ]

    return CaseResponse(
        case_id=UUID(str(state["case_id"])),
        status=str(state["status"]),
        version=int(str(state.get("version", 1))),
        request_text=str(state["request_text"]),
        triage=cast(dict[str, object], state["triage"]),
        evidence=cast(list[dict[str, object]], state["evidence"]),
        resolution_brief=cast(dict[str, object], state["resolution_brief"]),
        provider=str(state["provider"]),
        fallback_reason=str(state["fallback_reason"]) if state.get("fallback_reason") else None,
        model=str(state["model"]) if state.get("model") else None,
        review=cast(dict[str, object], state["review"]) if state.get("review") else None,
        review_draft=cast(dict[str, object], state["review_draft"])
        if state.get("review_draft")
        else None,
        clarifications=cast(list[dict[str, object]], state.get("clarifications") or []),
        revisions=revisions,
        current_revision=int(str(state.get("current_revision", len(revisions)))),
    )


class CaseQueueItem(BaseModel):
    """Compact summary of a case for queue display."""

    model_config = ConfigDict(extra="forbid")

    case_id: UUID
    status: str
    priority: str
    risk: str | None = None
    request_text: str
    version: int = Field(default=1, ge=1)
    created_at: datetime
    updated_at: datetime


class CaseQueueResponse(BaseModel):
    """Paginated list of cases in the operator queue."""

    model_config = ConfigDict(extra="forbid")

    items: list[CaseQueueItem]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("", response_model=CaseQueueResponse)
def list_cases(
    status: CaseStatus | None = Query(default=None),
    priority: Priority | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    session: Session = Depends(get_session),
) -> CaseQueueResponse:
    """List cases with server-side pagination, search, and filtering."""
    repository = CaseRepository(session)
    status_filter = status.value if status is not None else None
    priority_filter = priority.value if priority is not None else None
    q_filter = q.strip() if q and q.strip() else None

    records, total = repository.list_cases(
        status=status_filter,
        priority=priority_filter,
        q=q_filter,
        page=page,
        page_size=page_size,
    )

    items: list[CaseQueueItem] = []
    for record in records:
        ws = record.workflow_state if isinstance(record.workflow_state, dict) else {}
        raw_triage = ws.get("triage")
        triage: dict[str, object] = raw_triage if isinstance(raw_triage, dict) else {}
        item_priority = str(triage.get("priority", "P3"))
        raw_risk = triage.get("risk")
        item_risk = str(raw_risk) if raw_risk is not None else None
        item_version = int(str(ws.get("version", 1)))

        items.append(
            CaseQueueItem(
                case_id=record.id,
                status=record.status,
                priority=item_priority,
                risk=item_risk,
                request_text=record.raw_request,
                version=item_version,
                created_at=record.created_at,
                updated_at=record.updated_at,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return CaseQueueResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CreateCaseRequest,
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CaseResponse:
    """Create a case and run it until the mandatory human review gate."""
    limiter = cast(IntakeRateLimiter, request.app.state.intake_rate_limiter)
    limiter.check(client_id_from_request(request))

    repository = CaseRepository(session)
    workflow = CaseWorkflow(repository, TriageAndBriefService(settings))
    return _response(workflow.run(payload.request_text))


@router.get("/{case_id}", response_model=CaseResponse)
def get_case(case_id: UUID, session: Session = Depends(get_session)) -> CaseResponse:
    """Reload the latest persisted workflow checkpoint for a case."""

    workflow_state = CaseRepository(session).load_workflow_state(case_id)
    if workflow_state is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="case not found")
    return _response(workflow_state)


@router.post("/{case_id}/review", response_model=CaseResponse)
def review_case(
    case_id: UUID, payload: ReviewRequest, session: Session = Depends(get_session)
) -> CaseResponse:
    """Persist edits, reject safely, or execute one approved mock incident."""

    review = Review(
        actor=payload.actor,
        edits=payload.edits,
        decision=payload.decision,
        comment=payload.comment,
        reviewed_at=datetime.now(UTC),
    )
    try:
        state = ReviewService(CaseRepository(session)).submit(
            case_id,
            review,
            expected_version=payload.expected_version,
            idempotency_key=payload.idempotency_key,
        )
    except CaseNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ReviewConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    return _response(state)


@router.put("/{case_id}/draft", response_model=CaseResponse)
def save_draft(
    case_id: UUID, payload: SaveDraftRequest, session: Session = Depends(get_session)
) -> CaseResponse:
    """Save human review draft without submitting a decision."""
    draft_input = ReviewDraftInput(
        actor=payload.actor,
        priority=payload.priority,
        reply_draft=payload.reply_draft,
        requester_facts=payload.requester_facts,
        comment=payload.comment,
    )
    try:
        state = ReviewService(CaseRepository(session)).save_draft(
            case_id,
            draft_input,
            expected_draft_version=payload.expected_draft_version,
        )
    except CaseNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ReviewConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return _response(state)


@router.delete("/{case_id}/draft", response_model=CaseResponse)
def reset_draft(
    case_id: UUID,
    actor: str = Query(default="operator", min_length=1, max_length=255),
    expected_draft_version: int | None = Query(default=None, ge=0),
    session: Session = Depends(get_session),
) -> CaseResponse:
    """Reset saved review draft back to initial AI brief."""
    try:
        state = ReviewService(CaseRepository(session)).reset_draft(
            case_id,
            actor=actor,
            expected_draft_version=expected_draft_version,
        )
    except CaseNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ReviewConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    return _response(state)


@router.post("/{case_id}/clarifications", response_model=CaseResponse)
def add_clarification(
    case_id: UUID,
    payload: AddClarificationRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CaseResponse:
    """Add clarification from requester and re-analyze the case."""
    workflow = CaseWorkflow(CaseRepository(session), TriageAndBriefService(settings))
    try:
        state = workflow.reanalyze(
            case_id,
            clarification_text=payload.text,
            author=payload.author,
            idempotency_key=payload.idempotency_key,
            discard_draft=payload.discard_draft,
        )
    except CaseNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ReviewConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error
    return _response(state)


@router.get("/{case_id}/trace", response_model=TraceResponse)
def get_trace(case_id: UUID, session: Session = Depends(get_session)) -> TraceResponse:
    """Return all durable events in their assigned sequence order."""

    repository = CaseRepository(session)
    if repository.get(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="case not found")
    return TraceResponse(case_id=case_id, events=repository.list_audit_events(case_id))
