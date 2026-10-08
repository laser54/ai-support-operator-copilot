"""Explicit voluntary human labels are independent of action approval."""

import json
from copy import deepcopy
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import test_triage_mode as triage_test_setup

from app.persistence.models import MockIncidentRecord
from app.persistence.repositories import CaseRepository

REQUEST = triage_test_setup.REQUEST
factory = triage_test_setup.factory
harness = triage_test_setup.harness


def label_payload(**changes):
    return {
        "revision_number": 1,
        "reviewer": "human@example.test",
        "human_reviewed": True,
        "outcome": "classified",
        "category": "support/request",
        "priority": "P4",
        "risk": "low",
        **changes,
    }


def create(client):
    response = client.post("/cases", json={"request_text": REQUEST})
    assert response.status_code == 201, response.text
    return response.json()


def persisted(factory, case_id):
    with factory() as session:
        repository = CaseRepository(session)
        return (
            deepcopy(repository.load_workflow_state(UUID(case_id))),
            [
                event.model_dump(mode="json")
                for event in repository.list_audit_events(UUID(case_id))
            ],
            session.query(MockIncidentRecord).count(),
        )


def post_label(client, case_id, payload=None):
    return client.post(f"/cases/{case_id}/triage-labels", json=payload or label_payload())


def test_unlabeled_case_readback_is_not_an_approval_label(harness, factory):
    client, _, _, _ = harness
    initial = create(client)
    assert initial["triage_labels"] == []
    assert initial["revision_labels"] == [{
        "revision_number": 1, "label_status": "unlabeled", "triage_labels": [], "label_ids": [],
    }]
    before = persisted(factory, initial["case_id"])
    assert client.get(f"/cases/{initial['case_id']}").json() == initial
    assert persisted(factory, initial["case_id"]) == before
    approved = client.post(f"/cases/{initial['case_id']}/review", json={
        "actor": "operator", "decision": "approve", "expected_version": 1,
        "idempotency_key": "approval-is-not-label",
    })
    assert approved.status_code == 200, approved.text
    assert approved.json()["triage_labels"] == []
    assert approved.json()["revision_labels"][0]["label_status"] == "unlabeled"


def test_append_label_and_correction_preserve_state_history_and_audit(
    harness, factory, monkeypatch,
):
    client, prose, decision, _ = harness
    initial = create(client)
    case_id = initial["case_id"]
    draft = client.put(f"/cases/{case_id}/draft", json={
        "actor": "operator", "priority": "P2", "expected_draft_version": 0,
    })
    assert draft.status_code == 200
    before, events, incidents = persisted(factory, case_id)
    calls = (prose.decision_calls, prose.prose_calls, decision.calls)
    monkeypatch.setattr(CaseRepository, "execute_mock_incident", lambda *a, **kw: pytest.fail(
        "label must never execute an incident"
    ))
    response = post_label(client, case_id)
    assert response.status_code == 201, response.text
    data = response.json()
    first = data["triage_labels"][0]
    assert UUID(first["label_id"])
    assert first["reviewer"] == "human@example.test"
    assert first["human_reviewed"] is True
    assert first["revision_number"] == 1
    assert first["supersedes_label_id"] is None
    assert first["labeled_at"]
    assert data["revisions"] == initial["revisions"]
    assert data["revision_labels"][0] == {
        "revision_number": 1, "label_status": "labeled", "triage_labels": [first],
        "label_ids": [first["label_id"]],
    }
    after, new_events, new_incidents = persisted(factory, case_id)
    assert {k: v for k, v in after.items() if k != "triage_labels"} == {
        k: v for k, v in before.items() if k != "triage_labels"
    }
    assert new_incidents == incidents == 0
    assert new_events[:-1] == events
    assert new_events[-1]["event_type"] == "triage_label_recorded"
    assert new_events[-1]["actor_id"] == first["reviewer"]
    assert first["label_id"] in new_events[-1]["output_summary"]
    assert "approval" not in new_events[-1]["output_summary"]
    correction = post_label(client, case_id, label_payload(
        priority="P2", supersedes_label_id=first["label_id"], comment="Corrected priority",
    ))
    assert correction.status_code == 201, correction.text
    labels = correction.json()["triage_labels"]
    assert labels[0] == first
    assert labels[1]["supersedes_label_id"] == first["label_id"]
    assert labels[1]["priority"] == "P2"
    assert len(correction.json()["revision_labels"][0]["label_ids"]) == 2
    assert client.get(f"/cases/{case_id}").json() == correction.json()
    snapshot = persisted(factory, case_id)
    assert post_label(client, case_id, label_payload()).status_code == 409
    assert post_label(client, case_id, label_payload(
        supersedes_label_id=first["label_id"],
    )).status_code == 409
    assert persisted(factory, case_id) == snapshot
    assert (prose.decision_calls, prose.prose_calls, decision.calls) == calls


MISSING_FIELDS = [
    "revision_number", "reviewer", "human_reviewed", "outcome", "category", "priority", "risk",
]


@pytest.mark.parametrize("missing", MISSING_FIELDS)
@pytest.mark.parametrize("outcome", ["classified", "uncertain/review"])
def test_missing_fields_never_inherit_predictions(harness, factory, missing, outcome):
    client, _, _, _ = harness
    initial = create(client)
    payload = label_payload(outcome=outcome)
    payload.pop(missing)
    before = persisted(factory, initial["case_id"])
    response = post_label(client, initial["case_id"], payload)
    assert response.status_code == 422, response.text
    assert persisted(factory, initial["case_id"]) == before


@pytest.mark.parametrize("changes", [
    {"reviewer": "  \n"}, {"human_reviewed": False}, {"human_reviewed": 1},
    {"human_reviewed": "true"}, {"outcome": "approve"}, {"category": " "},
    {"category": None}, {"priority": None}, {"risk": None}, {"priority": "P0"},
    {"risk": "critical"}, {"revision_number": 0}, {"revision_number": True},
    {"revision_number": "1"}, {"decision": "approve"}, {"supersedes_label_id": "invalid"},
])
def test_invalid_labels_are_rejected_without_any_writes(harness, factory, changes):
    client, _, _, _ = harness
    initial = create(client)
    before = persisted(factory, initial["case_id"])
    response = post_label(client, initial["case_id"], label_payload(**changes))
    assert response.status_code == 422, response.text
    assert persisted(factory, initial["case_id"]) == before


def test_uncertain_label_is_explicit_and_does_not_copy_model(harness, factory):
    client, _, _, _ = harness
    initial = create(client)
    response = post_label(client, initial["case_id"], label_payload(
        outcome="uncertain/review", category=None, priority=None, risk=None,
    ))
    assert response.status_code == 201, response.text
    label = response.json()["triage_labels"][0]
    assert label["outcome"] == "uncertain/review"
    assert label["category"] is label["priority"] is label["risk"] is None
    assert response.json()["triage"] == initial["triage"]


def test_revision_linkage_missing_case_and_stale_cross_revision_corrections(harness, factory):
    client, _, _, _ = harness
    initial = create(client)
    case_id = initial["case_id"]
    before = persisted(factory, case_id)
    assert post_label(client, str(uuid4())).status_code == 404
    assert post_label(client, case_id, label_payload(revision_number=2)).status_code == 404
    invalid_correction = label_payload(supersedes_label_id=str(uuid4()))
    assert post_label(client, case_id, invalid_correction).status_code == 409
    assert persisted(factory, case_id) == before
    first = post_label(client, case_id)
    assert first.status_code == 201, first.text
    first_label = first.json()["triage_labels"][0]
    second_revision = client.post(f"/cases/{case_id}/clarifications", json={"text": "More context"})
    assert second_revision.status_code == 200, second_revision.text
    assert second_revision.json()["triage_labels"] == [first_label]
    assert [item["label_status"] for item in second_revision.json()["revision_labels"]] == [
        "labeled", "unlabeled",
    ]
    before = persisted(factory, case_id)
    assert post_label(client, case_id, label_payload(
        revision_number=2, supersedes_label_id=first_label["label_id"],
    )).status_code == 409
    assert persisted(factory, case_id) == before
    assert post_label(client, case_id, label_payload(revision_number=2)).status_code == 201


@pytest.mark.parametrize("terminal", ["approve", "reject"])
def test_completed_or_rejected_cases_can_be_labeled_without_reopening(harness, factory, terminal):
    client, _, _, _ = harness
    initial = create(client)
    case_id = initial["case_id"]
    review = client.post(f"/cases/{case_id}/review", json={
        "actor": "operator", "decision": terminal, "expected_version": 1,
        "idempotency_key": "terminal-review",
    })
    assert review.status_code == 200, review.text
    before, events, incidents = persisted(factory, case_id)
    labeled = post_label(client, case_id)
    assert labeled.status_code == 201, labeled.text
    after, new_events, new_incidents = persisted(factory, case_id)
    assert {k: v for k, v in after.items() if k != "triage_labels"} == {
        k: v for k, v in before.items() if k != "triage_labels"
    }
    assert new_incidents == incidents
    assert new_events[:-1] == events
    replay = client.post(f"/cases/{case_id}/review", json={
        "actor": "operator", "decision": terminal, "expected_version": 1,
        "idempotency_key": "terminal-review",
    })
    assert replay.status_code == 200
    assert replay.json() == labeled.json()


def test_legacy_synthetic_revision_one_label_and_review_are_independent(harness, factory):
    client, _, _, _ = harness
    initial = create(client)
    case_id = initial["case_id"]
    with factory() as session:
        repository = CaseRepository(session)
        state = deepcopy(repository.load_workflow_state(UUID(case_id)))
        state.pop("revisions")
        repository.save_workflow_state(UUID(case_id), state)
    legacy = client.get(f"/cases/{case_id}").json()
    assert legacy["revision_labels"][0]["label_status"] == "unlabeled"
    response = post_label(client, case_id)
    assert response.status_code == 201, response.text
    assert response.json()["revision_labels"][0]["label_status"] == "labeled"
    assert persisted(factory, case_id)[0]["revisions"] == legacy["revisions"]
    reviewed = client.post(f"/cases/{case_id}/review", json={
        "actor": "operator", "decision": "approve", "expected_version": 1,
        "idempotency_key": "review-after-label",
    })
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "completed"
    assert reviewed.json()["triage_labels"] == response.json()["triage_labels"]


@pytest.mark.parametrize("failure_point", ["save_workflow_state", "add_audit_event", "commit"])
def test_label_transaction_rolls_back_state_and_audit(
    harness, factory, monkeypatch, failure_point,
):
    client, _, _, _ = harness
    initial = create(client)
    before = persisted(factory, initial["case_id"])
    def fail(*args, **kwargs):
        raise RuntimeError("synthetic transaction failure")
    monkeypatch.setattr(CaseRepository, failure_point, fail)
    with pytest.raises(RuntimeError, match="synthetic transaction failure"):
        post_label(client, initial["case_id"])
    assert persisted(factory, initial["case_id"]) == before


def test_label_service_uses_locked_read_and_one_atomic_transaction(harness, monkeypatch):
    client, _, _, _ = harness
    initial = create(client)
    operations = []
    names = ("load_workflow_state_for_update", "save_workflow_state", "add_audit_event", "commit")
    for name in names:
        original = getattr(CaseRepository, name)

        def track(*args, _name=name, _original=original, **kwargs):
            operations.append((_name, kwargs.get("commit")))
            return _original(*args, **kwargs)

        monkeypatch.setattr(CaseRepository, name, track)
    response = post_label(client, initial["case_id"])
    assert response.status_code == 201, response.text
    assert operations == [
        ("load_workflow_state_for_update", None),
        ("save_workflow_state", False),
        ("add_audit_event", False),
        ("commit", None),
    ]


def test_label_audit_redacts_classification_and_optional_comment(harness, factory):
    client, _, _, _ = harness
    initial = create(client)
    response = post_label(client, initial["case_id"], label_payload(
        category="synthetic-sensitive-category", comment="synthetic-sensitive-comment",
    ))
    assert response.status_code == 201, response.text
    _, events, _ = persisted(factory, initial["case_id"])
    event = events[-1]
    assert event["event_type"] == "triage_label_recorded"
    summaries = event["input_summary"] + event["output_summary"]
    assert "synthetic-sensitive-category" not in summaries
    assert "synthetic-sensitive-comment" not in summaries
    assert "revision_number=1" in summaries


def test_real_synthetic_fixture_import_is_validation_only(harness, factory, monkeypatch):
    from app.triage_labels import load_synthetic_triage_labels
    client, _, _, _ = harness
    initial = create(client)
    before = persisted(factory, initial["case_id"])
    monkeypatch.setattr(CaseRepository, "save_workflow_state", lambda *a, **kw: pytest.fail(
        "fixture loader must not write cases"
    ))
    path = Path(__file__).resolve().parents[1] / "fixtures" / "triage_labels.json"
    rows = load_synthetic_triage_labels(path)
    assert len(rows) >= 2
    assert all(
        row.fixture_id and row.revision_number >= 1 and row.human_reviewed is True
        for row in rows
    )
    assert {row.outcome for row in rows} == {"classified", "uncertain/review"}
    assert persisted(factory, initial["case_id"]) == before


@pytest.mark.parametrize("change", [
    {"synthetic": False}, {"synthetic": "true"}, {"schema_version": 2},
    {"synthetic": 1}, {"schema_version": True}, {"schema_version": "1"},
    {"labels": [{"decision": "approve", "actor": "operator"}]},
    {"labels": [{"fixture_id": "fixture-a", **label_payload(), "human_reviewed": False}]},
    {"labels": [{"fixture_id": " ", **label_payload()}]},
    {"labels": [label_payload()]},
    {"labels": [{"fixture_id": "fixture-a", **label_payload()}] * 2},
    {"labels": [{"fixture_id": "fixture-a", **label_payload(supersedes_label_id=str(uuid4()))}]},
])
def test_fixture_loader_rejects_nonhuman_approval_shaped_or_invalid_files(tmp_path, change):
    from app.triage_labels import load_synthetic_triage_labels
    content = {"schema_version": 1, "synthetic": True,
               "labels": [{"fixture_id": "fixture-a", **label_payload()}], **change}
    path = tmp_path / "labels.json"
    path.write_text(json.dumps(content))
    with pytest.raises(ValueError):
        load_synthetic_triage_labels(path)


@pytest.mark.parametrize("missing", MISSING_FIELDS)
def test_fixture_rows_require_human_fields_and_revision_identity(tmp_path, missing):
    from app.triage_labels import load_synthetic_triage_labels
    row = {"fixture_id": "fixture-a", **label_payload()}
    row.pop(missing)
    path = tmp_path / "labels.json"
    path.write_text(json.dumps({"schema_version": 1, "synthetic": True, "labels": [row]}))
    with pytest.raises(ValueError):
        load_synthetic_triage_labels(path)


@pytest.mark.parametrize("missing", ["synthetic", "schema_version", "labels"])
def test_fixture_wrapper_requires_explicit_fields(tmp_path, missing):
    from app.triage_labels import load_synthetic_triage_labels
    content = {"schema_version": 1, "synthetic": True,
               "labels": [{"fixture_id": "fixture-a", **label_payload()}]}
    content.pop(missing)
    path = tmp_path / "labels.json"
    path.write_text(json.dumps(content))
    with pytest.raises(ValueError):
        load_synthetic_triage_labels(path)
