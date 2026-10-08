"""Reanalysis must not release the row lock before saving label-bearing state."""

from copy import deepcopy
from uuid import UUID

import pytest
import test_triage_labels as labels_setup
import test_triage_mode as setup

from app.persistence.repositories import CaseRepository

factory = setup.factory
harness = setup.harness


def test_reanalysis_retains_labels_and_holds_transaction_until_checkpoint(harness, monkeypatch):
    client, _, _, _ = harness
    initial = client.post("/cases", json={"request_text": setup.REQUEST}).json()
    case_id = initial["case_id"]
    labeled = client.post(
        f"/cases/{case_id}/triage-labels", json=labels_setup.label_payload(),
    ).json()
    operations = []
    for name in (
        "load_workflow_state_for_update", "add_audit_event", "save_workflow_state", "commit",
    ):
        original = getattr(CaseRepository, name)

        def track(*args, _name=name, _original=original, **kwargs):
            operations.append((_name, kwargs.get("commit", True)))
            return _original(*args, **kwargs)

        monkeypatch.setattr(CaseRepository, name, track)
    response = client.post(f"/cases/{case_id}/clarifications", json={"text": "More context"})
    assert response.status_code == 200, response.text
    assert response.json()["triage_labels"] == labeled["triage_labels"]
    assert response.json()["revision_labels"][0]["label_status"] == "labeled"
    assert operations[0][0] == "load_workflow_state_for_update"
    assert operations[-2:] == [("save_workflow_state", False), ("commit", True)]
    assert all(commit is False for name, commit in operations if name == "add_audit_event")
    assert sum(name == "commit" for name, _ in operations) == 1


@pytest.mark.parametrize("failure_point", ["generate", "save_workflow_state", "commit"])
def test_reanalysis_failure_preserves_label_and_atomic_history(
    harness, factory, monkeypatch, failure_point,
):
    client, _, _, service = harness
    initial = client.post("/cases", json={"request_text": setup.REQUEST}).json()
    case_id = initial["case_id"]
    label_response = client.post(
        f"/cases/{case_id}/triage-labels", json=labels_setup.label_payload(),
    )
    assert label_response.status_code == 201
    with factory() as session:
        repository = CaseRepository(session)
        before = deepcopy(repository.load_workflow_state(UUID(case_id)))
        events = repository.list_audit_events(UUID(case_id))

    def fail(*args, **kwargs):
        raise RuntimeError("synthetic analysis transaction failure")

    monkeypatch.setattr(service if failure_point == "generate" else CaseRepository,
                        failure_point, fail)
    with pytest.raises(RuntimeError, match="synthetic analysis transaction failure"):
        client.post(f"/cases/{case_id}/clarifications", json={"text": "More context"})
    with factory() as session:
        repository = CaseRepository(session)
        assert repository.load_workflow_state(UUID(case_id)) == before
        assert repository.list_audit_events(UUID(case_id)) == events
