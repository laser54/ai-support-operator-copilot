"""Safe audit event construction for workflow and tool calls."""

import re
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.domain.contracts import ActorType, AuditEvent

_SENSITIVE_KEY = re.compile(r"(api[_-]?key|authorization|password|secret|token)", re.IGNORECASE)


def safe_summary(values: dict[str, object]) -> str:
    """Create a bounded summary that redacts values under sensitive field names."""

    parts = [
        f"{key}={'[redacted]' if _SENSITIVE_KEY.search(key) else _summarize(value)}"
        for key, value in values.items()
    ]
    return "; ".join(parts)[:2_000]


def tool_call_event(
    *,
    case_id: UUID,
    tool_name: str,
    inputs: dict[str, object],
    evidence_source_ids: list[str],
    correlation_id: UUID | None = None,
) -> AuditEvent:
    """Build an event that records a fixture-tool call with safe summaries."""

    return AuditEvent(
        case_id=case_id,
        sequence=1,
        timestamp=datetime.now(UTC),
        event_type="tool_called",
        actor_type=ActorType.TOOL,
        actor_id="fixture-tools",
        name=tool_name,
        input_summary=safe_summary(inputs),
        output_summary=f"evidence_source_ids={','.join(evidence_source_ids) or 'none'}",
        correlation_id=correlation_id or uuid4(),
    )


def _summarize(value: object) -> str:
    if isinstance(value, str):
        return f"text(length={len(value)})"
    if isinstance(value, list):
        return f"list(length={len(value)})"
    if isinstance(value, dict):
        return f"object(keys={len(value)})"
    return str(value)
