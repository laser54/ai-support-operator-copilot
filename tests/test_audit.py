"""Tests for safe audit event creation and persistence."""

from uuid import uuid4

from app.audit import safe_summary, tool_call_event


def test_tool_audit_event_redacts_sensitive_input_and_records_evidence() -> None:
    event = tool_call_event(
        case_id=uuid4(),
        tool_name="search_knowledge",
        inputs={"query": "login HTTP 500", "api_key": "not-for-a-trace"},
        evidence_source_ids=["kb-auth-5xx-after-release"],
    )

    assert event.sequence == 1
    assert "api_key=[redacted]" in event.input_summary
    assert "not-for-a-trace" not in event.input_summary
    assert event.output_summary == "evidence_source_ids=kb-auth-5xx-after-release"


def test_safe_summary_does_not_include_raw_text() -> None:
    assert safe_summary({"request": "secret requester content"}) == "request=text(length=24)"
