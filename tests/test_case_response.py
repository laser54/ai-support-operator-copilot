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
