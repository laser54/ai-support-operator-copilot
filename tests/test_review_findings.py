"""Synthetic regressions for credential provenance, legacy labels and telemetry costs."""

import json
import math
from copy import deepcopy
from decimal import Decimal
from uuid import UUID

import httpx
import pytest
import test_analysis_provenance as provenance
import test_triage_labels as labels
import test_triage_mode as setup

from app.config import Settings
from app.decisions.contracts import ModelCallMetadata, Usage
from app.decisions.jev import JevClient, JevDecisionService
from app.decisions.pricing import with_cost_estimate
from app.llm.service import OpenAICompatibleClient
from app.persistence.repositories import CaseRepository

factory = setup.factory
harness = setup.harness
SYNTHETIC_KEY = "sk-synthetic-not-a-real-key-0000"


@pytest.mark.parametrize("mode", ["llm", "jev"])
@pytest.mark.parametrize("malformed", [False, True])
@pytest.mark.parametrize("embedded", [False, True])
def test_echoed_configured_credential_never_enters_provenance(
    harness, factory, mode, malformed, embedded,
):
    client, _, _, service = harness
    service._settings.llm_api_key = SYNTHETIC_KEY
    echoed = f"model/{SYNTHETIC_KEY}:version" if embedded else SYNTHETIC_KEY

    def handler(request):
        assert request.headers["Authorization"] == f"Bearer {SYNTHETIC_KEY}"
        output = setup.CountingProseClient().generate(setup.REQUEST, []).model_dump(mode="json")
        if mode == "jev":
            output.pop("triage")
        return httpx.Response(200, json={
            "model": echoed,
            "model_version": echoed,
            "usage": {"prompt_tokens": 23, "completion_tokens": 7},
            "choices": [{"message": {"content": "invalid" if malformed else json.dumps(output)}}],
        })

    service._client = OpenAICompatibleClient(
        api_key=service._settings.llm_api_key,
        base_url="https://synthetic.test/v1", model="synthetic-requested-model",
        transport=httpx.MockTransport(handler),
    )
    response = client.post("/cases", json={"request_text": setup.REQUEST, "triage_mode": mode})
    assert response.status_code == 201, response.text
    data = response.json()
    # Do not pass by throwing away the measured call or silently switching paths.
    assert data["prose_provider"] == (
        "deterministic_fallback" if malformed else "openai_compatible"
    )
    metadata_key = "prose_attempt_metadata" if malformed else "prose_metadata"
    observed = data[metadata_key]
    assert observed["usage"] == {"input_tokens": 23, "output_tokens": 7}
    assert observed["model"] is None
    assert observed["model_version"] is None
    if mode == "llm":
        decision_key = "decision_attempt_metadata" if malformed else "decision_metadata"
        assert data[decision_key] == observed
    for key in (
        "decision_metadata", "prose_metadata",
        "decision_attempt_metadata", "prose_attempt_metadata",
    ):
        assert SYNTHETIC_KEY not in json.dumps(data[key])
        assert SYNTHETIC_KEY not in json.dumps(data["revisions"][0][key])
    assert SYNTHETIC_KEY not in response.text
    case_id = UUID(data["case_id"])
    readback = client.get(f"/cases/{case_id}")
    assert readback.status_code == 200
    assert readback.json() == data
    assert SYNTHETIC_KEY not in readback.text
    with factory() as session:
        state = CaseRepository(session).load_workflow_state(case_id)
        assert state["revisions"] == data["revisions"]
        assert SYNTHETIC_KEY not in json.dumps(state)


def test_labeled_legacy_snapshot_survives_operational_review_edits(harness, factory):
    client, _, _, _ = harness
    initial = labels.create(client)
    case_id = initial["case_id"]
    with factory() as session:
        repository = CaseRepository(session)
        state = deepcopy(repository.load_workflow_state(UUID(case_id)))
        state.pop("revisions")
        repository.save_workflow_state(UUID(case_id), state)
    original = client.get(f"/cases/{case_id}").json()["revisions"][0]
    response = labels.post_label(client, case_id)
    assert response.status_code == 201, response.text
    labeled = response.json()
    assert labeled["revisions"] == [original]
    reviewed = client.post(f"/cases/{case_id}/review", json={
        "actor": "synthetic-operator", "decision": "approve", "expected_version": 1,
        "idempotency_key": "synthetic-review-after-label",
        "edits": {"priority": "P2", "reply_draft": "Synthetic operational reply edit."},
    })
    assert reviewed.status_code == 200, reviewed.text
    effective = reviewed.json()
    assert effective["triage"]["priority"] == "P2" != original["triage"]["priority"]
    assert effective["resolution_brief"]["reply_draft"] == "Synthetic operational reply edit."
    assert effective["revisions"] == [original]
    assert effective["triage_labels"] == labeled["triage_labels"]
    assert effective["revision_labels"] == labeled["revision_labels"]
    assert client.get(f"/cases/{case_id}").json() == effective
    stored = labels.persisted(factory, case_id)[0]
    assert stored["revisions"] == [original]
    assert stored["triage_labels"] == labeled["triage_labels"]


@pytest.mark.parametrize("malformed", [False, True])
def test_enormous_provider_token_count_cannot_abort_analysis(harness, factory, malformed):
    client, _, decision, _ = harness
    payload = provenance.jev_payload({"input_tokens": 10**400, "output_tokens": 5})
    if malformed:
        payload["answers"] = {"invalid": "synthetic invalid answers"}
    decision.delegate = JevDecisionService(
        Settings(_env_file=None, jev_api_key=None), client=JevClient(
            api_key=SYNTHETIC_KEY, transport=httpx.MockTransport(
                lambda request: httpx.Response(200, json=payload)
            ),
        ),
    )
    response = client.post("/cases", json={"request_text": setup.REQUEST, "triage_mode": "jev"})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["actual_mode"] == ("deterministic_fallback" if malformed else "jev")
    key = "decision_attempt_metadata" if malformed else "decision_metadata"
    metadata = data[key]
    assert metadata["usage"] == {"input_tokens": 10**400, "output_tokens": 5}
    assert metadata["cost"] is None
    assert metadata["cost_source"] == "unknown"
    estimate = metadata["cost_estimate"]
    assert estimate is None or (
        math.isfinite(estimate["amount"]) and estimate["amount"] > 0
        and estimate["source"] == "versioned_price_table_estimate"
    )
    assert data["revisions"][0][key] == metadata
    assert client.get(f"/cases/{data['case_id']}").json() == data
    with factory() as session:
        stored = CaseRepository(session).load_workflow_state(UUID(data["case_id"]))
        assert stored["revisions"] == data["revisions"]


@pytest.mark.parametrize("input_price", [
    Decimal("1e9999999"), Decimal("NaN"), Decimal("-1"), Decimal("1e-400"),
])
def test_cost_arithmetic_or_validation_failure_returns_unknown(monkeypatch, input_price):
    from app.decisions import pricing

    metadata = ModelCallMetadata(
        provider="openrouter/TypeSafe", model="typesafe/jev-1.13-20260917",
        usage=Usage(input_tokens=1, output_tokens=1), cost=0.02, cost_source="provider_usage",
    )
    monkeypatch.setattr(pricing, "PRICE_TABLE", {
        (metadata.provider, metadata.model): (input_price, Decimal("0")),
    })
    enriched = with_cost_estimate(metadata)
    assert enriched.cost_estimate is None
    assert enriched.model_dump(exclude={"cost_estimate"}) == metadata.model_dump(
        exclude={"cost_estimate"},
    )
