"""Repository implementations for durable application state."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.domain.contracts import ActorType, AuditEvent, ExecutionResult, ExecutionState
from app.persistence.models import (
    AuditEventRecord,
    CaseRecord,
    MockIncidentRecord,
    WorkflowCheckpointRecord,
)


class CaseRepository:
    """Persist and retrieve the minimal case record used by foundation tests."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, raw_request: str, *, status: str = "received") -> CaseRecord:
        """Create and commit a case record."""

        record = CaseRecord(raw_request=raw_request, status=status)
        self._session.add(record)
        self._session.commit()
        self._session.refresh(record)
        return record

    def get(self, case_id: UUID) -> CaseRecord | None:
        """Reload a case record by identifier."""

        return self._session.get(CaseRecord, case_id)

    def list_cases(
        self,
        *,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[CaseRecord], int]:
        """List cases with server-side filtering, search, and pagination."""
        query = self._session.query(CaseRecord)

        if status:
            query = query.filter(CaseRecord.status == status)

        if priority:
            bind = self._session.get_bind()
            dialect_name = bind.dialect.name if bind else "sqlite"
            if dialect_name == "sqlite":
                query = query.filter(
                    func.json_extract(CaseRecord.workflow_state, "$.triage.priority") == priority
                )
            elif dialect_name == "postgresql":
                query = query.filter(
                    func.json_extract_path_text(CaseRecord.workflow_state, "triage", "priority")
                    == priority
                )
            else:
                query = query.filter(
                    CaseRecord.workflow_state["triage"]["priority"].as_string() == priority
                )

        if q:
            q_clean = q.strip()
            if q_clean:
                try:
                    parsed_uuid = UUID(q_clean)
                    query = query.filter(
                        or_(
                            CaseRecord.id == parsed_uuid,
                            CaseRecord.raw_request.ilike(f"%{q_clean}%"),
                        )
                    )
                except ValueError:
                    query = query.filter(CaseRecord.raw_request.ilike(f"%{q_clean}%"))

        total = query.count()
        items = (
            query.order_by(CaseRecord.created_at.desc(), CaseRecord.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    def commit(self) -> None:
        """Commit the current transaction."""
        self._session.commit()

    def rollback(self) -> None:
        """Roll back the current transaction."""
        self._session.rollback()

    def save_workflow_state(
        self, case_id: UUID, state: dict[str, object], *, commit: bool = True
    ) -> None:
        """Store the current API-safe graph state and its latest checkpoint."""

        case = self._session.get(CaseRecord, case_id)
        if case is None:
            raise ValueError("case does not exist")
        case.status = str(state["status"])
        case.workflow_state = state
        checkpoint = self._session.get(WorkflowCheckpointRecord, case_id)
        if checkpoint is None:
            checkpoint = WorkflowCheckpointRecord(case_id=case_id, state=state)
            self._session.add(checkpoint)
        else:
            checkpoint.state = state
        if commit:
            self._session.commit()
        else:
            self._session.flush()

    def load_workflow_state(self, case_id: UUID) -> dict[str, object] | None:
        """Reload the latest persisted graph checkpoint."""

        checkpoint = self._session.get(WorkflowCheckpointRecord, case_id)
        return checkpoint.state if checkpoint is not None else None

    def load_workflow_state_for_update(self, case_id: UUID) -> dict[str, object] | None:
        """Reload the latest persisted graph checkpoint while locking the case row."""

        case = (
            self._session.query(CaseRecord)
            .filter(CaseRecord.id == case_id)
            .with_for_update()
            .one_or_none()
        )
        if case is None:
            return None
        checkpoint = (
            self._session.query(WorkflowCheckpointRecord)
            .filter(WorkflowCheckpointRecord.case_id == case_id)
            .with_for_update()
            .one_or_none()
        )
        return checkpoint.state if checkpoint is not None else None

    def execute_mock_incident(
        self, *, case_id: UUID, action_id: UUID, approval_id: UUID, commit: bool = True
    ) -> tuple[ExecutionResult, bool]:
        """Create one mock incident per action, returning an existing result on retry."""

        existing = self._session.get(MockIncidentRecord, action_id)
        if existing is not None:
            return self._execution_result(existing), False
        record = MockIncidentRecord(
            action_id=action_id,
            case_id=case_id,
            approval_id=approval_id,
            external_reference=f"MOCK-{str(action_id)[:8].upper()}",
        )
        self._session.add(record)
        if commit:
            self._session.commit()
        else:
            self._session.flush()
        self._session.refresh(record)
        return self._execution_result(record), True

    @staticmethod
    def _execution_result(record: MockIncidentRecord) -> ExecutionResult:
        return ExecutionResult(
            action_id=record.action_id,
            approval_id=record.approval_id,
            state=ExecutionState.SUCCEEDED,
            external_reference=record.external_reference,
            message="Mock Engineering incident created.",
            executed_at=record.created_at or datetime.now(UTC),
        )

    def add_audit_event(self, event: AuditEvent, *, commit: bool = True) -> AuditEvent:
        """Append one event with a database-assigned sequence for its case."""

        latest_sequence = (
            self._session.query(AuditEventRecord.sequence)
            .filter(AuditEventRecord.case_id == event.case_id)
            .order_by(AuditEventRecord.sequence.desc())
            .limit(1)
            .scalar()
        )
        record = AuditEventRecord(
            id=event.id,
            case_id=event.case_id,
            sequence=(latest_sequence or 0) + 1,
            timestamp=event.timestamp,
            event_type=event.event_type,
            actor_type=event.actor_type.value,
            actor_id=event.actor_id,
            name=event.name,
            input_summary=event.input_summary,
            output_summary=event.output_summary,
            correlation_id=event.correlation_id,
        )
        self._session.add(record)
        if commit:
            self._session.commit()
        else:
            self._session.flush()
        self._session.refresh(record)
        return event.model_copy(update={"sequence": record.sequence})

    def list_audit_events(self, case_id: UUID) -> list[AuditEvent]:
        """Reload a case trace in its persisted sequence order."""

        records = (
            self._session.query(AuditEventRecord)
            .filter(AuditEventRecord.case_id == case_id)
            .order_by(AuditEventRecord.sequence)
            .all()
        )
        return [
            AuditEvent(
                id=record.id,
                case_id=record.case_id,
                sequence=record.sequence,
                timestamp=record.timestamp,
                event_type=record.event_type,
                actor_type=ActorType(record.actor_type),
                actor_id=record.actor_id,
                name=record.name,
                input_summary=record.input_summary,
                output_summary=record.output_summary,
                correlation_id=record.correlation_id,
            )
            for record in records
        ]
