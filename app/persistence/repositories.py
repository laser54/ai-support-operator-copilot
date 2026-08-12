"""Repository implementations for durable application state."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.domain.contracts import ActorType, AuditEvent
from app.persistence.models import AuditEventRecord, CaseRecord


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

    def add_audit_event(self, event: AuditEvent) -> AuditEvent:
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
        self._session.commit()
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
