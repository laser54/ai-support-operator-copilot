"""Integration coverage for the intake/read API and policy gate."""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is required for API integration tests"
)


def test_login_500_intake_stops_at_human_review_and_reloads_checkpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert TEST_DATABASE_URL is not None
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)

    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    with create_engine(TEST_DATABASE_URL).begin() as connection:
        connection.execute(text("TRUNCATE TABLE cases CASCADE"))

    client = TestClient(app)
    response = client.post(
        "/cases",
        json={
            "request_text": (
                "After the update, sales employees cannot sign in to the portal: "
                "they see a 500 error. This is urgent."
            )
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "awaiting_human_review"
    assert created["triage"]["priority"] == "P1"
    assert [item["source_id"] for item in created["evidence"]] == [
        "kb-auth-5xx-after-release",
        "inc-104",
        "status-portal-auth-5xx",
    ]
    assert created["resolution_brief"]["proposed_actions"][0]["state"] == "proposed"
    assert all(
        "execute" not in action for action in created["resolution_brief"]["proposed_actions"]
    )

    reloaded = client.get(f"/cases/{created['case_id']}")
    assert reloaded.status_code == 200
    assert reloaded.json() == created


def test_approval_edits_case_executes_one_mock_incident_and_records_trace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert TEST_DATABASE_URL is not None
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    with create_engine(TEST_DATABASE_URL).begin() as connection:
        connection.execute(text("TRUNCATE TABLE cases CASCADE"))

    client = TestClient(app)
    created = client.post(
        "/cases", json={"request_text": "Portal login HTTP 500 after update"}
    ).json()
    case_id = created["case_id"]
    approval = {
        "actor": "operator@example.test",
        "decision": "approve",
        "edits": {"priority": "P2", "reply_draft": "Engineering is investigating."},
    }
    first = client.post(f"/cases/{case_id}/review", json=approval)
    second = client.post(f"/cases/{case_id}/review", json=approval)

    assert first.status_code == 200
    assert first.json()["status"] == "completed"
    assert first.json()["triage"]["priority"] == "P2"
    assert first.json()["resolution_brief"]["reply_draft"] == "Engineering is investigating."
    action = first.json()["resolution_brief"]["proposed_actions"][0]
    assert action["state"] == "executed"
    assert action["execution_result"]["external_reference"].startswith("MOCK-")
    assert second.status_code == 200
    assert second.json()["resolution_brief"]["proposed_actions"][0]["execution_result"] == action[
        "execution_result"
    ]
    trace = client.get(f"/cases/{case_id}/trace")
    assert trace.status_code == 200
    assert [event["sequence"] for event in trace.json()["events"]] == list(
        range(1, len(trace.json()["events"]) + 1)
    )
    assert [event["event_type"] for event in trace.json()["events"]].count("action_executed") == 1


def test_rejection_never_executes_mock_incident(monkeypatch: pytest.MonkeyPatch) -> None:
    assert TEST_DATABASE_URL is not None
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    with create_engine(TEST_DATABASE_URL).begin() as connection:
        connection.execute(text("TRUNCATE TABLE cases CASCADE"))

    client = TestClient(app)
    created = client.post(
        "/cases", json={"request_text": "Portal login HTTP 500 after update"}
    ).json()
    case_id = created["case_id"]
    rejected = client.post(
        f"/cases/{case_id}/review",
        json={
            "actor": "operator@example.test",
            "decision": "reject",
            "comment": "Duplicate report.",
        },
    )

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert all(
        action["state"] == "rejected"
        for action in rejected.json()["resolution_brief"]["proposed_actions"]
    )
    trace = client.get(f"/cases/{case_id}/trace").json()["events"]
    assert "action_executed" not in [event["event_type"] for event in trace]


def test_case_api_rejects_invalid_intake_and_unknown_case_ids(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert TEST_DATABASE_URL is not None
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    client = TestClient(app)
    assert client.post("/cases", json={"request_text": "", "unexpected": True}).status_code == 422
    missing = client.get("/cases/00000000-0000-0000-0000-000000000000")
    missing_trace = client.get("/cases/00000000-0000-0000-0000-000000000000/trace")
    assert missing.status_code == 404
    assert missing.json() == {"error": {"code": "not_found", "message": "case not found"}}
    assert missing_trace.status_code == 404
    assert missing_trace.json() == {"error": {"code": "not_found", "message": "case not found"}}
