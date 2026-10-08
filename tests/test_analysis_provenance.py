"""Per-run measured provenance, with no assumed usage or provider latency."""

import json
from copy import deepcopy
from uuid import UUID

import httpx
import pytest
import test_triage_mode as setup

from app.config import Settings
from app.decisions.contracts import ModelCallMetadata, Usage
from app.decisions.jev import JevClient, JevDecisionService
from app.decisions.rubric import CATEGORY_CRITERIA, PRIORITY_CRITERIA
from app.llm.service import OpenAICompatibleClient, TriageAndBriefService
from app.persistence.repositories import CaseRepository

factory = setup.factory
harness = setup.harness


def provider_client(*, usage=None, model="synthetic-prose-v1", model_version=None, malformed=False):
    def handler(request):
        output = setup.CountingProseClient().generate(setup.REQUEST, []).model_dump(mode="json")
        if "Do not classify" in json.loads(request.content)["messages"][0]["content"]:
            output.pop("triage")
        return httpx.Response(200, json={
            "model": model,
            "model_version": model_version,
            "usage": usage,
            "choices": [{"message": {"content": "invalid" if malformed else json.dumps(output)}}],
        })
    return OpenAICompatibleClient(
        api_key="synthetic-key", base_url="https://synthetic.test/v1",
        model="requested-prose", transport=httpx.MockTransport(handler),
    )


def jev_payload(usage=None):
    return {
        "model": "typesafe/jev-1.13-20260917", "provider": "TypeSafe", "usage": usage,
        "answers": {
            "category": {"type": "choice", "choice": "support/request", "confidence": 1.0,
                         "probabilities": {k: float(k == "support/request")
                                           for k in CATEGORY_CRITERIA}},
            "priority": {"type": "score", "score": 1.0, "confidence": 1.0,
                         "legend": {str(i): v for i, v in enumerate(PRIORITY_CRITERIA)},
                         "probabilities": {str(i): float(i == 1) for i in range(4)}},
            "risk": {"type": "choice", "choice": "low", "confidence": 1.0,
                     "probabilities": {"low": 1.0, "medium": 0.0, "high": 0.0}},
            "review_needed": {"type": "noul", "noul": 0.0},
        },
    }


@pytest.mark.parametrize("mode", ["llm", "jev"])
@pytest.mark.parametrize("failure", [False, True])
def test_every_revision_has_distinct_decision_prose_and_measured_wall_times(
    harness, factory, mode, failure,
):
    client, prose, decision, _ = harness
    prose.failure = failure
    if failure:
        decision.delegate = JevDecisionService(Settings(_env_file=None, jev_api_key=None))
    initial = client.post("/cases", json={
        "request_text": setup.REQUEST, "triage_mode": mode,
    }).json()
    response = client.post(f"/cases/{initial['case_id']}/clarifications", json={"text": "Context"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["revisions"][0] == initial["revisions"][0]
    for revision in data["revisions"]:
        assert revision["triage_mode"] == mode
        assert revision["actual_mode"] == ("deterministic_fallback" if failure else mode)
        assert revision["decision_metadata"]["provider"] == (
            "deterministic_fallback" if failure else
            "openrouter/TypeSafe" if mode == "jev" else "openai_compatible"
        )
        assert revision["prose_metadata"]["provider"] == revision["prose_provider"]
        assert revision["prose_metadata"]["fallback_reason"] == revision["prose_fallback_reason"]
        if failure:
            assert revision["decision_metadata"]["fallback_reason"]
            assert revision["prose_metadata"]["fallback_reason"]
        for key in (
            "decision_wall_time_ms", "prose_generation_wall_time_ms", "analysis_wall_time_ms",
        ):
            assert revision[key] >= 0
            assert revision[key] <= revision["analysis_wall_time_ms"]
        for key in ("decision_metadata", "prose_metadata"):
            metadata = revision[key]
            assert metadata["provider_latency_ms"] is None
            assert metadata["usage"] is None
            assert metadata["cost"] is None
            assert metadata["cost_source"] == "unknown"
            assert metadata["cost_estimate"] is None
        if mode == "llm":
            assert revision["generation_call_scope"] == "shared_triage_and_prose"
            assert revision["decision_wall_time_ms"] == revision["prose_generation_wall_time_ms"]
        else:
            assert revision["generation_call_scope"] == "separate_decision_and_prose"
    assert client.get(f"/cases/{data['case_id']}").json() == data
    with factory() as session:
        state = CaseRepository(session).load_workflow_state(UUID(data["case_id"]))
        assert state["revisions"] == data["revisions"]


@pytest.mark.parametrize("mode", ["llm", "jev"])
def test_real_transport_metadata_and_independent_usage_survive_reanalysis(harness, factory, mode):
    client, _, decision, service = harness
    service._client = provider_client(usage={
        "prompt_tokens": 23, "completion_tokens": 7, "cost": 0.01,
    })
    decision.delegate = JevDecisionService(Settings(_env_file=None), client=JevClient(
        api_key="synthetic-key", transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=jev_payload(
                {"input_tokens": 100, "output_tokens": 5, "cost": 0.002}
            ))
        ),
    ))
    initial = client.post("/cases", json={
        "request_text": setup.REQUEST, "triage_mode": mode,
    }).json()
    response = client.post(f"/cases/{initial['case_id']}/clarifications", json={"text": "More"})
    assert response.status_code == 200, response.text
    for revision in response.json()["revisions"]:
        prose = revision["prose_metadata"]
        assert prose["model"] == "synthetic-prose-v1"
        assert prose["requested_model"] == "requested-prose"
        assert prose["usage"] == {"input_tokens": 23, "output_tokens": 7}
        assert prose["cost"] == 0.01
        assert prose["cost_source"] == "provider_usage"
        assert prose["cost_estimate"] is None
        assert prose["provider_latency_ms"] is None
        metadata = revision["decision_metadata"]
        if mode == "jev":
            assert metadata["model"] == "typesafe/jev-1.13-20260917"
            assert metadata["requested_model"] == "typesafe/jev-1.13"
            assert metadata["usage"] == {"input_tokens": 100, "output_tokens": 5}
            assert metadata["cost"] == 0.002
            estimate = metadata["cost_estimate"]
            assert estimate["source"] == "versioned_price_table_estimate"
            assert estimate["currency"] == "USD"
            assert estimate["price_table_version"]
            assert estimate["priced_model"] == metadata["model"]
            assert estimate["amount"] == pytest.approx(0.0000042)
        else:
            assert metadata["usage"] == prose["usage"]
            assert metadata["cost"] == prose["cost"]  # One shared call, never additive.
            assert metadata["model"] == prose["model"]


@pytest.mark.parametrize("usage", [None, {}, {"prompt_tokens": 11}, {"completion_tokens": 0}])
def test_chat_absent_quantities_are_unknown_not_assumed_zero(usage):
    result = TriageAndBriefService(
        Settings(_env_file=None), client=provider_client(usage=usage),
    ).generate(setup.REQUEST, [])
    metadata = result.to_decision().metadata.model_dump(mode="json")
    assert metadata["cost"] is None
    assert metadata["cost_source"] == "unknown"
    assert metadata["cost_estimate"] is None
    assert metadata["provider_latency_ms"] is None
    if usage:
        assert metadata["usage"] == {
            "input_tokens": usage.get("prompt_tokens"),
            "output_tokens": usage.get("completion_tokens"),
        }
    else:
        assert metadata["usage"] is None


@pytest.mark.parametrize("usage", [
    {"prompt_tokens": -1, "completion_tokens": 2},
    {"prompt_tokens": True, "completion_tokens": "2"},
    {"cost": "secret-response-body"}, {"cost": -1},
])
def test_invalid_optional_telemetry_does_not_poison_valid_analysis_or_leak(usage):
    result = TriageAndBriefService(
        Settings(_env_file=None), client=provider_client(usage=usage),
    ).generate(setup.REQUEST, [])
    assert result.provider == "openai_compatible"
    metadata = result.to_decision().metadata.model_dump(mode="json")
    # Invalid quantities cannot erase other valid provider measurements.
    assert metadata["usage"] == (
        {"input_tokens": None, "output_tokens": 2}
        if usage.get("completion_tokens") == 2 else None
    )
    assert metadata["cost"] is None
    assert "secret-response-body" not in json.dumps(metadata)


@pytest.mark.parametrize("mode", ["llm", "jev"])
def test_billed_malformed_prose_retains_attempt_not_fallback_usage(harness, mode):
    client, _, _, service = harness
    service._client = provider_client(
        usage={"prompt_tokens": 23, "completion_tokens": 7, "cost": 0.01}, malformed=True,
    )
    response = client.post("/cases", json={"request_text": setup.REQUEST, "triage_mode": mode})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["prose_provider"] == "deterministic_fallback"
    assert data["prose_metadata"]["usage"] is None
    assert data["prose_metadata"]["cost"] is None
    attempt = data["prose_attempt_metadata"]
    assert attempt["provider"] == "openai_compatible"
    assert attempt["model"] == "synthetic-prose-v1"
    assert attempt["requested_model"] == "requested-prose"
    assert attempt["usage"] == {"input_tokens": 23, "output_tokens": 7}
    assert attempt["cost"] == 0.01
    assert attempt["cost_source"] == "provider_usage"
    assert attempt["wall_time_ms"] >= 0
    assert attempt["provider_latency_ms"] is None
    if mode == "llm":
        assert data["decision_attempt_metadata"] == attempt
    else:
        assert data["decision_attempt_metadata"] is None
    assert data["revisions"][0]["prose_attempt_metadata"] == attempt


def test_billed_malformed_jev_decision_retains_sanitized_attempt(harness):
    client, _, decision, _ = harness
    payload = jev_payload({"input_tokens": 100, "output_tokens": 5, "cost": 0.002})
    payload["answers"] = {"invalid": "sensitive-response-text"}
    decision.delegate = JevDecisionService(Settings(_env_file=None), client=JevClient(
        api_key="synthetic-key", transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json=payload)
        ),
    ))
    response = client.post("/cases", json={"request_text": setup.REQUEST, "triage_mode": "jev"})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["actual_mode"] == "deterministic_fallback"
    assert data["decision_metadata"]["usage"] is None
    assert data["decision_metadata"]["cost"] is None
    attempt = data["decision_attempt_metadata"]
    assert attempt["provider"] == "openrouter/TypeSafe"
    assert attempt["usage"] == {"input_tokens": 100, "output_tokens": 5}
    assert attempt["cost"] == 0.002
    assert attempt["cost_estimate"]["amount"] == pytest.approx(0.0000042)
    assert "sensitive-response-text" not in response.text


def test_mixed_invalid_telemetry_preserves_other_actual_quantities():
    result = TriageAndBriefService(Settings(_env_file=None), client=provider_client(
        usage={"prompt_tokens": 10, "completion_tokens": -1, "cost": 0.02},
    )).generate(setup.REQUEST, [])
    metadata = result.to_decision().metadata
    assert metadata.usage == Usage(input_tokens=10)
    assert metadata.cost == 0.02
    assert metadata.cost_source == "provider_usage"


def test_reported_version_is_retained_but_no_version_is_invented():
    service = TriageAndBriefService(Settings(_env_file=None), client=provider_client(
        model_version="synthetic-prose-build-20261008",
    ))
    metadata = service.generate(setup.REQUEST, []).to_decision().metadata
    assert metadata.model_version == "synthetic-prose-build-20261008"
    service._client = provider_client(model_version="sensitive free text\nnot a version")
    metadata = service.generate(setup.REQUEST, []).to_decision().metadata
    assert metadata.model_version is None


def test_transport_metadata_cannot_leak_from_a_previous_call():
    service = TriageAndBriefService(Settings(_env_file=None), client=provider_client(
        usage={"prompt_tokens": 23, "completion_tokens": 7, "cost": 0.01},
    ))
    first = service.generate(setup.REQUEST, []).to_decision().metadata
    service._client = provider_client(model=None)
    second = service.generate(setup.REQUEST, []).to_decision().metadata
    assert first.usage == Usage(input_tokens=23, output_tokens=7)
    assert first.cost == 0.01
    assert second.usage is None
    assert second.cost is None
    assert second.model is None


@pytest.mark.parametrize("usage,model,expected", [
    (None, "typesafe/jev-1.13-20260917", None),
    (Usage(input_tokens=100), "typesafe/jev-1.13-20260917", None),
    (Usage(input_tokens=100, output_tokens=5), "typesafe/jev-1.13", None),
    (Usage(input_tokens=100, output_tokens=5), "unreviewed-model", None),
    (Usage(input_tokens=100, output_tokens=5), "typesafe/jev-1.13-20260917", 0.0000042),
    (Usage(input_tokens=0, output_tokens=0), "typesafe/jev-1.13-20260917", 0.0),
])
def test_cost_estimate_requires_actual_complete_usage_and_exact_pinned_price(
    usage, model, expected,
):
    from app.decisions.pricing import with_cost_estimate
    metadata = ModelCallMetadata(provider="openrouter/TypeSafe", model=model, usage=usage)
    enriched = with_cost_estimate(metadata)
    assert enriched.cost is None
    assert enriched.cost_source == "unknown"  # Reported cost is still unknown.
    if expected is None:
        assert enriched.cost_estimate is None
    else:
        assert enriched.cost_estimate.amount == pytest.approx(expected)
        assert enriched.cost_estimate.source == "versioned_price_table_estimate"
        assert enriched.cost_estimate.price_table_version
    unreviewed = metadata.model_copy(update={"provider": "unreviewed"})
    assert with_cost_estimate(unreviewed).cost_estimate is None


def test_legacy_measurements_remain_unknown_without_mutating_history(harness, factory):
    from app.decisions.contracts import PROVENANCE_KEYS
    client, _, _, _ = harness
    initial = client.post("/cases", json={"request_text": setup.REQUEST}).json()
    case_id = UUID(initial["case_id"])
    with factory() as session:
        repository = CaseRepository(session)
        state = deepcopy(repository.load_workflow_state(case_id))
        for key in PROVENANCE_KEYS:
            state.pop(key, None)
            state["revisions"][0].pop(key, None)
        repository.save_workflow_state(case_id, state)
    data = client.get(f"/cases/{case_id}").json()
    for key in PROVENANCE_KEYS:
        assert data[key] is None
        assert data["revisions"][0][key] is None
    with factory() as session:
        assert CaseRepository(session).load_workflow_state(case_id) == state
