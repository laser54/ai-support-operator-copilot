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
    assert created["version"] == 1
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
        "expected_version": 1,
        "idempotency_key": "idemp-test-approval-1",
    }
    first = client.post(f"/cases/{case_id}/review", json=approval)
    second = client.post(f"/cases/{case_id}/review", json=approval)

    assert first.status_code == 200
    assert first.json()["status"] == "completed"
    assert first.json()["version"] == 2
    assert first.json()["triage"]["priority"] == "P2"
    assert first.json()["resolution_brief"]["reply_draft"] == "Engineering is investigating."
    action = first.json()["resolution_brief"]["proposed_actions"][0]
    assert action["state"] == "executed"
    assert action["execution_result"]["external_reference"].startswith("MOCK-")
    assert second.status_code == 200
    assert second.json()["version"] == 2
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
            "expected_version": 1,
            "idempotency_key": "idemp-test-reject-1",
        },
    )

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["version"] == 2
    assert all(
        action["state"] == "rejected"
        for action in rejected.json()["resolution_brief"]["proposed_actions"]
    )
    trace = client.get(f"/cases/{case_id}/trace").json()["events"]
    assert "action_executed" not in [event["event_type"] for event in trace]


def test_review_rejects_version_mismatch_and_conflicting_idempotency(
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

    # 1. Version mismatch returns 409 Conflict
    mismatch = client.post(
        f"/cases/{case_id}/review",
        json={
            "actor": "operator@example.test",
            "decision": "approve",
            "expected_version": 999,
            "idempotency_key": "key-mismatch",
        },
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["error"]["code"] == "conflict"
    assert "version mismatch" in mismatch.json()["error"]["message"]

    # 2. Complete the case
    approval = {
        "actor": "operator@example.test",
        "decision": "approve",
        "expected_version": 1,
        "idempotency_key": "valid-key-1",
    }
    completed = client.post(f"/cases/{case_id}/review", json=approval)
    assert completed.status_code == 200

    # 3. Same idempotency key with conflicting payload returns 409 Conflict
    conflicting_retry = client.post(
        f"/cases/{case_id}/review",
        json={
            "actor": "operator@example.test",
            "decision": "reject",
            "expected_version": 1,
            "idempotency_key": "valid-key-1",
        },
    )
    assert conflicting_retry.status_code == 409
    assert conflicting_retry.json()["error"]["code"] == "conflict"

    # 4. Completed case cannot be re-reviewed with different key
    terminal_conflict = client.post(
        f"/cases/{case_id}/review",
        json={
            "actor": "operator@example.test",
            "decision": "reject",
            "expected_version": 2,
            "idempotency_key": "different-key",
        },
    )
    assert terminal_conflict.status_code == 409
    assert terminal_conflict.json()["error"]["code"] == "conflict"
    assert "terminal state" in terminal_conflict.json()["error"]["message"]


def test_concurrent_reviews_only_one_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    import concurrent.futures

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
    assert created["version"] == 1

    def submit_review(decision: str, comment: str, key: str):
        c = TestClient(app)
        return c.post(
            f"/cases/{case_id}/review",
            json={
                "actor": f"operator-{decision}@example.test",
                "decision": decision,
                "comment": comment,
                "expected_version": 1,
                "idempotency_key": key,
            },
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_review, "approve", "Approved by tab 1", "key-tab-1")
        f2 = executor.submit(submit_review, "reject", "Rejected by tab 2", "key-tab-2")
        r1 = f1.result()
        r2 = f2.result()

    statuses = {r1.status_code, r2.status_code}
    assert statuses == {200, 409}
    winner = r1 if r1.status_code == 200 else r2
    loser = r2 if r1.status_code == 200 else r1
    assert winner.json()["version"] == 2
    assert loser.status_code == 409
    assert loser.json()["error"]["code"] == "conflict"

    # Reload checkpoint and verify consistency
    reloaded = client.get(f"/cases/{case_id}").json()
    assert reloaded["version"] == 2
    assert reloaded["status"] in {"completed", "rejected"}


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
