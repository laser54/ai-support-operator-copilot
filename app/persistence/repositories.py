"""Repository implementations for durable application state."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.persistence.models import CaseRecord


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
