"""Voluntary human triage labels, separate from workflow review and approval.

Labels are append-only observations about an analysis revision. A correction
must explicitly supersede the latest label on that revision. Synthetic fixture
loading validates offline records only and has no persistence side effects.
"""

from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from app.domain.contracts import ActorType, AuditEvent, Priority, RiskLevel
from app.graph.workflow import legacy_revision
from app.persistence.repositories import CaseRepository
from app.review import CaseNotFoundError


class TriageLabelInput(BaseModel):
    """An explicit human observation; no classification is inferred or defaulted."""

    model_config = ConfigDict(extra="forbid")

    revision_number: int = Field(ge=1, strict=True)
    reviewer: str = Field(min_length=1, max_length=255)
    human_reviewed: StrictBool
    outcome: Literal["classified", "uncertain/review"]
    # Required even when null, so an uncertain human label is intentional.
    category: str | None = Field(max_length=80)
    priority: Priority | None
    risk: RiskLevel | None
    comment: str | None = Field(default=None, max_length=2_000)
    supersedes_label_id: UUID | None = None

    @field_validator("reviewer", "category")
    @classmethod
    def require_nonblank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("human label fields cannot be blank")
        return value

    @field_validator("human_reviewed")
    @classmethod
    def require_human_reviewed(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("human_reviewed must be explicitly true")
        return value

    @model_validator(mode="after")
    def require_classification(self) -> "TriageLabelInput":
        if self.outcome == "classified" and any(
            value is None for value in (self.category, self.priority, self.risk)
        ):
            raise ValueError("classified labels require category, priority and risk")
        return self


class TriageLabel(TriageLabelInput):
    """Stored label identity and time, assigned only by the human-label service."""

    label_id: UUID
    labeled_at: datetime


class RevisionLabels(BaseModel):
    """Read-time label view keyed by revision, without modifying analysis snapshots."""

    model_config = ConfigDict(extra="forbid")

    revision_number: int
    label_status: Literal["labeled", "unlabeled"]
    triage_labels: list[TriageLabel]
    label_ids: list[UUID]


def revision_label_views(
    revisions: list[dict[str, object]], labels: list[TriageLabel],
) -> list[RevisionLabels]:
    """Project append-only labels per revision; approvals are never inspected."""
    views = []
    for revision in revisions:
        number = int(str(revision["revision_number"]))
        revision_labels = [label for label in labels if label.revision_number == number]
        views.append(RevisionLabels(
            revision_number=number,
            label_status="labeled" if revision_labels else "unlabeled",
            triage_labels=revision_labels,
            label_ids=[label.label_id for label in revision_labels],
        ))
    return views


class TriageLabelConflictError(Exception):
    """A correction is unlinked, cross-revision, or based on stale label history."""


class TriageLabelRevisionNotFoundError(Exception):
    """The supplied analysis revision does not exist on this case."""


class TriageLabelService:
    """Atomically append a label and audit event under the existing case row lock."""

    def __init__(self, repository: CaseRepository) -> None:
        self._repository = repository

    def append(self, case_id: UUID, payload: TriageLabelInput) -> dict[str, object]:
        try:
            original = self._repository.load_workflow_state_for_update(case_id)
            if original is None:
                raise CaseNotFoundError("case not found")
            # JSON columns need a new object, and validation/rollback must never
            # mutate a session's loaded workflow state in place.
            state = deepcopy(original)
            revisions = cast(list[dict[str, object]], state.get("revisions") or [])
            numbers = {revision["revision_number"] for revision in revisions} if revisions else {1}
            if payload.revision_number not in numbers:
                raise TriageLabelRevisionNotFoundError("analysis revision not found")

            labels = cast(list[dict[str, object]], state.get("triage_labels") or [])
            prior = [
                label for label in labels if label["revision_number"] == payload.revision_number
            ]
            if prior:
                if payload.supersedes_label_id is None:
                    raise TriageLabelConflictError("correction requires supersedes_label_id")
                if str(payload.supersedes_label_id) != str(prior[-1]["label_id"]):
                    raise TriageLabelConflictError(
                        "correction must supersede latest label on this revision"
                    )
            elif payload.supersedes_label_id is not None:
                raise TriageLabelConflictError("superseded label does not belong to this revision")

            if not revisions:
                # Freeze the linked analysis separately from mutable operational state.
                state["revisions"] = [deepcopy(legacy_revision(state))]

            label = TriageLabel(
                **payload.model_dump(), label_id=uuid4(), labeled_at=datetime.now(UTC),
            )
            state["triage_labels"] = [*labels, label.model_dump(mode="json")]
            self._repository.save_workflow_state(case_id, state, commit=False)
            self._repository.add_audit_event(AuditEvent(
                case_id=case_id,
                sequence=1,
                timestamp=label.labeled_at,
                event_type="triage_label_recorded",
                actor_type=ActorType.OPERATOR,
                actor_id=label.reviewer,
                name="human_triage_label",
                input_summary=f"revision_number={label.revision_number}; human_reviewed=true",
                output_summary=(
                    f"label_id={label.label_id}; outcome={label.outcome}; "
                    f"supersedes_label_id={label.supersedes_label_id}"
                ),
                correlation_id=label.label_id,
            ), commit=False)
            self._repository.commit()
            return state
        except Exception:
            self._repository.rollback()
            raise


class SyntheticTriageLabel(TriageLabelInput):
    """Offline human label identified by fixture and revision, never a live case."""

    fixture_id: str = Field(min_length=1, max_length=255)

    @field_validator("fixture_id")
    @classmethod
    def require_fixture_identity(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("fixture_id cannot be blank")
        return value

    @model_validator(mode="after")
    def prohibit_live_linkage(self) -> "SyntheticTriageLabel":
        if self.supersedes_label_id is not None:
            raise ValueError("offline fixtures cannot supersede runtime labels")
        return self


class SyntheticTriageLabelFixture(BaseModel):
    """Versioned wrapper marking every supplied example explicitly synthetic."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(strict=True)
    synthetic: StrictBool
    labels: list[SyntheticTriageLabel] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_wrapper(self) -> "SyntheticTriageLabelFixture":
        if self.schema_version != 1:
            raise ValueError("unsupported triage label fixture schema_version")
        if self.synthetic is not True:
            raise ValueError("triage label fixtures must be explicitly synthetic")
        identities = [(label.fixture_id, label.revision_number) for label in self.labels]
        if len(identities) != len(set(identities)):
            raise ValueError("duplicate fixture_id and revision_number identity")
        return self


def load_synthetic_triage_labels(path: str | Path) -> list[SyntheticTriageLabel]:
    """Validate an actual JSON fixture file without accessing runtime cases."""
    fixture = SyntheticTriageLabelFixture.model_validate_json(
        Path(path).read_text(encoding="utf-8")
    )
    return fixture.labels
