"""Case intake and retrieval endpoints."""

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.contracts import AuditEvent, Review, ReviewDecision, ReviewEdits
from app.graph.workflow import CaseWorkflow
from app.llm.service import TriageAndBriefService
from app.persistence.database import get_session
from app.persistence.repositories import CaseRepository
from app.review import ReviewService

router = APIRouter(prefix="/cases", tags=["cases"])


class CreateCaseRequest(BaseModel):
    """Free-text support intake request."""

    model_config = ConfigDict(extra="forbid")

    request_text: str = Field(min_length=1, max_length=10_000)


class CaseResponse(BaseModel):
    """Persisted workflow state exposed by the API."""

    model_config = ConfigDict(extra="forbid")

    case_id: UUID
    status: str
    request_text: str
    triage: dict[str, object]
    evidence: list[dict[str, object]]
    resolution_brief: dict[str, object]
    provider: str
    fallback_reason: str | None = None


class ReviewRequest(BaseModel):
    """Human correction and approval/rejection decision."""

    model_config = ConfigDict(extra="forbid")

    actor: str = Field(min_length=1, max_length=255)
    edits: ReviewEdits = Field(default_factory=ReviewEdits)
    decision: ReviewDecision
    comment: str | None = Field(default=None, max_length=2_000)


class TraceResponse(BaseModel):
    """Ordered persisted audit trace for one case."""

    case_id: UUID
    events: list[AuditEvent]


def _response(state: dict[str, object]) -> CaseResponse:
    return CaseResponse(
        case_id=UUID(str(state["case_id"])),
        status=str(state["status"]),
        request_text=str(state["request_text"]),
        triage=cast(dict[str, object], state["triage"]),
        evidence=cast(list[dict[str, object]], state["evidence"]),
        resolution_brief=cast(dict[str, object], state["resolution_brief"]),
        provider=str(state["provider"]),
        fallback_reason=str(state["fallback_reason"]) if state.get("fallback_reason") else None,
    )


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CreateCaseRequest, session: Session = Depends(get_session)
) -> CaseResponse:
    """Create a case and run it until the mandatory human review gate."""

    repository = CaseRepository(session)
    workflow = CaseWorkflow(repository, TriageAndBriefService(get_settings()))
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
        state = ReviewService(CaseRepository(session)).submit(case_id, review)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    return _response(state)


@router.get("/{case_id}/trace", response_model=TraceResponse)
def get_trace(case_id: UUID, session: Session = Depends(get_session)) -> TraceResponse:
    """Return all durable events in their assigned sequence order."""

    repository = CaseRepository(session)
    if repository.get(case_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="case not found")
    return TraceResponse(case_id=case_id, events=repository.list_audit_events(case_id))
