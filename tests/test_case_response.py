from uuid import uuid4

from app.api.cases import _response


def test_case_response_exposes_the_original_request_text() -> None:
    body = _response(
        {
            "case_id": str(uuid4()),
            "status": "awaiting_human_review",
            "request_text": "portal login HTTP 500 after update",
            "triage": {"priority": "P1"},
            "evidence": [],
            "resolution_brief": {"reply_draft": "draft"},
            "provider": "deterministic_fallback",
            "fallback_reason": "provider_not_configured",
        }
    )

    assert body.request_text == "portal login HTTP 500 after update"
    assert body.model is None
    assert body.case_id
    assert body.version == 1
    assert body.review is None


def test_case_response_exposes_review_when_present() -> None:
    review_data = {
        "id": str(uuid4()),
        "actor": "operator@example.test",
        "decision": "approve",
        "edits": {"reply_draft": "Updated reply"},
        "comment": "Looks good",
        "reviewed_at": "2026-08-12T11:00:00Z",
    }
    body = _response(
        {
            "case_id": str(uuid4()),
            "status": "completed",
            "request_text": "portal login HTTP 500 after update",
            "triage": {"priority": "P2"},
            "evidence": [],
            "resolution_brief": {"reply_draft": "Updated reply"},
            "provider": "deterministic_fallback",
            "fallback_reason": None,
            "review": review_data,
        }
    )

    assert body.review == review_data
    assert body.status == "completed"
