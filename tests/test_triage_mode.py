"""Issue #16: one explicit decision path, separately attributed prose, safe revisions."""

import json
from collections.abc import Generator
from copy import deepcopy
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import cases
from app.config import Settings, get_settings
from app.decisions.contracts import DecisionResult, ModelCallMetadata
from app.decisions.jev import JevClient, JevDecisionService
from app.decisions.rubric import CATEGORY_CRITERIA, HUMAN_REVIEW_INFORMATION, PRIORITY_CRITERIA
from app.domain.contracts import Evidence, Priority, RiskLevel, Triage
from app.llm import service as llm
from app.persistence.database import get_session
from app.persistence.models import Base, MockIncidentRecord
from app.persistence.repositories import CaseRepository
from app.rate_limit import IntakeRateLimiter

REQUEST = "Portal login HTTP 500 after update"
PROVENANCE_KEYS = (
    "triage_mode", "actual_mode", "uncertain", "decision_metadata",
    "prose_provider", "prose_model", "prose_fallback_reason",
)


class CountingProseClient:
    def __init__(self, failure: bool = False) -> None:
        self.decision_calls = 0
        self.prose_calls = 0
        self.failure = failure
        self.selected: list[Triage] = []

    def generate(self, request_text: str, evidence: list[Evidence]) -> llm.ModelOutput:
        self.decision_calls += 1
        if self.failure:
            raise ValueError("synthetic failure, do not expose")
        return llm.ModelOutput(
            triage=Triage(category="incident/access", priority=Priority.P1,
                          risk=RiskLevel.HIGH, confidence=0.9,
                          missing_information=["first observed timestamp"]),
            requester_facts=["Requester reports login HTTP 500 after an update."],
            inferences=["The update may have caused an incident."],
            missing_information=["first observed timestamp"],
            reply_draft="We are investigating the login failure.",
        )

    def generate_brief(self, request_text: str, evidence: list[Evidence], triage: Triage):
        self.prose_calls += 1
        self.selected.append(triage.model_copy(deep=True))
        if self.failure:
            raise ValueError("synthetic prose failure, do not expose")
        return llm.BriefOutput(
            requester_facts=["Requester reports login HTTP 500 after an update."],
            inferences=["The update may have caused an incident."],
            missing_information=["first observed timestamp"],
            reply_draft="Prose generated independently of the triage decision.",
        )


class CountingDecision:
    def __init__(self, delegate=None) -> None:
        self.calls = 0
        self.delegate = delegate

    def decide(self, request_text: str, evidence: list[Evidence]) -> DecisionResult:
        self.calls += 1
        if self.delegate is not None:
            return self.delegate.decide(request_text, evidence)
        return DecisionResult(
            triage=Triage(category="support/request", priority=Priority.P3,
                          risk=RiskLevel.LOW, confidence=0.95, missing_information=[]),
            actual_mode="jev", uncertain=False,
            metadata=ModelCallMetadata(provider="openrouter/TypeSafe",
                                       model="typesafe/jev-1.13-20261001",
                                       requested_model="typesafe/jev-1.13"),
        )


@pytest.fixture
def factory() -> Generator[sessionmaker[Session], None, None]:
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def harness(factory, monkeypatch):
    settings = Settings(_env_file=None, llm_api_key=None, llm_base_url=None,
                        llm_model="synthetic-prose-model", jev_api_key=None)
    prose = CountingProseClient()
    decision = CountingDecision()
    service = llm.TriageAndBriefService(settings, client=prose)
    monkeypatch.setattr(cases, "TriageAndBriefService", lambda settings: service)
    monkeypatch.setattr(cases, "JevDecisionService", lambda settings: decision, raising=False)
    api = FastAPI()
    api.include_router(cases.router)
    api.state.intake_rate_limiter = IntakeRateLimiter(limit=100, window_seconds=3600)

    def sessions():
        with factory() as session:
            yield session

    api.dependency_overrides[get_session] = sessions
    api.dependency_overrides[get_settings] = lambda: settings
    with TestClient(api) as client:
        yield client, prose, decision, service


def assert_gate(data, factory) -> None:
    assert data["status"] == "awaiting_human_review"
    assert data["review"] is None
    assert all(a["state"] == "proposed" for a in data["resolution_brief"]["proposed_actions"])
    with factory() as session:
        assert session.query(MockIncidentRecord).count() == 0
        events = CaseRepository(session).list_audit_events(UUID(data["case_id"]))
        assert events[-1].event_type == "human_review_requested"
        assert not any(e.event_type == "action_executed" for e in events)


@pytest.mark.parametrize("mode", [None, "llm"])
@pytest.mark.parametrize("failure", [False, True])
def test_llm_default_and_explicit_keep_original_generation_and_review_semantics(
    harness, factory, mode, failure,
) -> None:
    client, prose, decision, _ = harness
    prose.failure = failure
    payload = {"request_text": REQUEST}
    if mode is not None:
        payload["triage_mode"] = mode
    response = client.post("/cases", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["triage_mode"] == "llm"
    assert data["actual_mode"] == ("deterministic_fallback" if failure else "llm")
    assert data["triage"]["priority"] == "P1"
    assert data["resolution_brief"]["requester_facts"] == [
        "Requester reports login HTTP 500 after an update."
    ]
    assert data["uncertain"] is True
    provider = "deterministic_fallback" if failure else "openai_compatible"
    assert data["decision_metadata"]["provider"] == provider
    assert data["prose_provider"] == data["provider"] == provider
    assert data["decision_metadata"]["model"] is None  # Legacy transport has no resolved model.
    assert data["decision_metadata"]["requested_model"] == (
        None if failure else "synthetic-prose-model"
    )
    assert data["fallback_reason"] == ("provider_output_unavailable" if failure else None)
    assert data["resolution_brief"]["reply_draft"] == (
        "We have recorded the access issue and are checking it with Engineering. "
        "Please send the approximate first failure time and one affected user or account example."
        if failure else "We are investigating the login failure."
    )
    assert prose.decision_calls == 1
    assert prose.prose_calls == decision.calls == 0
    assert_gate(data, factory)
    assert client.get(f"/cases/{data['case_id']}").json() == data
    for key in PROVENANCE_KEYS:
        assert data["revisions"][0][key] == data[key]


@pytest.mark.parametrize("failure", [False, True])
def test_jev_calls_one_decision_and_only_prose_with_independent_provenance(
    harness, factory, failure,
) -> None:
    client, prose, decision, _ = harness
    prose.failure = failure
    response = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert response.status_code == 201, response.text
    data = response.json()
    assert decision.calls == prose.prose_calls == 1
    assert prose.decision_calls == 0
    assert prose.selected[0].model_dump(mode="json") == data["triage"]
    assert data["triage"]["priority"] == "P3"  # Not the LLM's login-500 heuristic.
    assert data["triage_mode"] == data["actual_mode"] == "jev"
    assert data["uncertain"] is False
    assert data["decision_metadata"]["provider"] == "openrouter/TypeSafe"
    assert data["decision_metadata"]["model"] == "typesafe/jev-1.13-20261001"
    assert data["decision_metadata"]["fallback_reason"] is None
    assert data["prose_provider"] == (
        "deterministic_fallback" if failure else "openai_compatible"
    )
    assert data["prose_model"] == (None if failure else "synthetic-prose-model")
    assert data["prose_fallback_reason"] == (
        "provider_output_unavailable" if failure else None
    )
    assert data["provider"] == data["prose_provider"]  # Backward-compatible generator alias.
    assert data["resolution_brief"]["proposed_actions"][0]["risk"] == "low"
    assert_gate(data, factory)
    assert client.get(f"/cases/{data['case_id']}").json() == data
    for key in PROVENANCE_KEYS:
        assert data["revisions"][0][key] == data[key]
    events = client.get(f"/cases/{data['case_id']}/trace").json()["events"]
    summary = next(e["output_summary"] for e in events if e["event_type"] == "brief_built")
    assert "decision_provider=openrouter/TypeSafe" in summary
    assert f"prose_provider={data['prose_provider']}" in summary


@pytest.mark.parametrize("mode", ["invalid", "deterministic_fallback", "JEV", "", None, 1])
def test_invalid_mode_is_pydantic_422_before_any_provider_or_case(harness, factory, mode) -> None:
    client, prose, decision, _ = harness
    response = client.post("/cases", json={"request_text": REQUEST, "triage_mode": mode})
    assert response.status_code == 422
    assert any(e["loc"] == ["body", "triage_mode"] and e["type"] == "literal_error"
               for e in response.json()["detail"])
    assert decision.calls == prose.decision_calls == prose.prose_calls == 0
    with factory() as session:
        assert CaseRepository(session).list_cases()[1] == 0


@pytest.mark.parametrize("reason", ["jev_not_configured", "jev_timeout", "jev_invalid_output"])
@pytest.mark.parametrize("offline_prose", [False, True])
def test_real_jev_safe_fallback_never_uses_llm_decision(
    harness, factory, reason, offline_prose,
) -> None:
    client, prose, decision, service = harness
    transport_calls = []

    def handler(request):
        transport_calls.append(request)
        if reason == "jev_timeout":
            raise httpx.ReadTimeout("synthetic sensitive exception", request=request)
        return httpx.Response(200, json={"malformed": "synthetic sensitive body"})

    settings = Settings(_env_file=None, jev_api_key=None)
    adapter = JevClient(api_key=None if reason == "jev_not_configured" else "synthetic-key",
                        transport=httpx.MockTransport(handler))
    decision.delegate = JevDecisionService(settings, client=adapter)
    if offline_prose:
        service._client = None
    response = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["triage_mode"] == "jev"
    assert data["actual_mode"] == "deterministic_fallback"
    assert data["uncertain"] is True
    assert data["triage"]["category"] == "uncertain/review"
    assert data["triage"]["priority"] == "P3"
    assert data["triage"]["risk"] == "high"
    assert data["triage"]["missing_information"] == [HUMAN_REVIEW_INFORMATION]
    assert HUMAN_REVIEW_INFORMATION in data["resolution_brief"]["missing_information"]
    assert data["decision_metadata"]["provider"] == "deterministic_fallback"
    assert data["decision_metadata"]["model"] is None
    assert data["decision_metadata"]["fallback_reason"] == reason
    assert data["prose_provider"] == (
        "deterministic_fallback" if offline_prose else "openai_compatible"
    )
    assert data["prose_fallback_reason"] == (
        "provider_not_configured" if offline_prose else None
    )
    assert decision.calls == 1
    assert prose.decision_calls == 0
    assert prose.prose_calls == (0 if offline_prose else 1)
    assert len(transport_calls) == (0 if reason == "jev_not_configured" else 1)
    assert "synthetic sensitive" not in response.text
    assert_gate(data, factory)
    for key in PROVENANCE_KEYS:
        assert data["revisions"][0][key] == data[key]


@pytest.mark.parametrize("mode", ["llm", "jev"])
def test_clarification_preserves_mode_snapshots_and_idempotent_provenance(harness, factory, mode):
    client, prose, decision, _ = harness
    created = client.post("/cases", json={"request_text": REQUEST, "triage_mode": mode})
    assert created.status_code == 201, created.text
    initial = created.json()
    path = f"/cases/{initial['case_id']}/clarifications"
    payload = {"text": "Gateway is EU. No automatic approval.", "idempotency_key": "mode-replay"}
    updated = client.post(path, json=payload)
    assert updated.status_code == 200, updated.text
    data = updated.json()
    assert data["triage_mode"] == mode
    assert data["current_revision"] == data["version"] == 2
    assert data["revisions"][0] == initial["revisions"][0]
    assert data["revisions"][1]["triage_mode"] == mode
    for key in PROVENANCE_KEYS:
        assert data["revisions"][1][key] == data[key]
    assert_gate(data, factory)
    calls = (decision.calls, prose.decision_calls, prose.prose_calls)
    assert calls == ((2, 0, 2) if mode == "jev" else (0, 2, 0))
    assert client.post(path, json=payload).json() == data
    assert client.get(f"/cases/{data['case_id']}").json() == data
    assert (decision.calls, prose.decision_calls, prose.prose_calls) == calls
    assert client.post(path, json={**payload, "text": "conflicting text"}).status_code == 409


@pytest.mark.parametrize("has_revisions", [False, True])
def test_legacy_unknown_provenance_remains_unknown_then_defaults_to_llm(
    harness, factory, has_revisions,
):
    client, prose, decision, _ = harness
    created = client.post("/cases", json={"request_text": REQUEST})
    assert created.status_code == 201
    case_id = UUID(created.json()["case_id"])
    with factory() as session:
        repository = CaseRepository(session)
        state = deepcopy(repository.load_workflow_state(case_id))
        for key in PROVENANCE_KEYS:
            state.pop(key, None)
            for revision in state["revisions"]:
                revision.pop(key, None)
        if not has_revisions:
            state.pop("revisions")
        repository.save_workflow_state(case_id, state)
    legacy = client.get(f"/cases/{case_id}").json()
    for key in PROVENANCE_KEYS:
        assert legacy[key] is None
        assert legacy["revisions"][0][key] is None
    assert client.get(f"/cases/{case_id}").json()["revisions"] == legacy["revisions"]
    updated = client.post(f"/cases/{case_id}/clarifications", json={"text": "More context"})
    assert updated.status_code == 200
    data = updated.json()
    assert data["triage_mode"] == data["actual_mode"] == "llm"
    for key in PROVENANCE_KEYS:
        assert data["revisions"][0][key] is None
    assert prose.decision_calls == 2
    assert prose.prose_calls == decision.calls == 0
    assert_gate(data, factory)


def test_jev_approval_is_still_a_separate_human_api(harness, factory):
    client, _, decision, _ = harness
    created = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert created.status_code == 201, created.text
    initial = created.json()
    assert_gate(initial, factory)
    reviewed = client.post(f"/cases/{initial['case_id']}/review", json={
        "actor": "operator@example.test", "decision": "approve", "expected_version": 1,
        "idempotency_key": "explicit-human-approval",
    })
    assert reviewed.status_code == 200, reviewed.text
    data = reviewed.json()
    assert data["status"] == "completed"
    for key in PROVENANCE_KEYS:
        assert data[key] == initial[key]
    assert data["revisions"] == initial["revisions"]
    assert decision.calls == 1
    with factory() as session:
        assert session.query(MockIncidentRecord).count() == 1


@pytest.mark.parametrize("extra_triage", [False, True])
def test_prose_transport_has_no_triage_output_contract_and_cannot_replace_decision(extra_triage):
    captured = []
    selected = CountingDecision().decide(REQUEST, []).triage

    def handler(request):
        captured.append(json.loads(request.content))
        output = {"requester_facts": ["Reported login error"],
                  "inferences": ["Needs investigation"], "missing_information": ["timestamp"],
                  "reply_draft": "We have recorded the report."}
        if extra_triage:
            output["triage"] = {"priority": "P1"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(output)}}]})

    client = llm.OpenAICompatibleClient(api_key="synthetic-key", base_url="https://llm.test/v1",
                                       model="synthetic-prose-model",
                                       transport=httpx.MockTransport(handler))
    result = llm.TriageAndBriefService(Settings(_env_file=None, llm_model="synthetic-prose-model"),
                                      client=client).generate_brief(REQUEST, [], selected)
    assert len(captured) == 1
    system_prompt = captured[0]["messages"][0]["content"]
    user_prompt = captured[0]["messages"][1]["content"]
    assert '"triage":' not in system_prompt
    assert "Do not classify" in system_prompt
    assert selected.model_dump_json() in user_prompt
    assert result.provider == ("deterministic_fallback" if extra_triage else "openai_compatible")
    assert result.fallback_reason == ("provider_output_unavailable" if extra_triage else None)
    assert result.brief.proposed_actions[0].risk == selected.risk
    assert selected.priority == Priority.P3


@pytest.mark.parametrize("bad_prose", ["empty_choices", "empty_fact", "long_missing"])
@pytest.mark.parametrize("reanalysis", [False, True])
def test_malformed_prose_still_checkpoints_jev_and_stops_at_gate(
    harness, factory, bad_prose, reanalysis,
):
    client, prose, decision, service = harness
    if reanalysis:
        initial = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"}).json()
    transport_calls = []

    def handler(request):
        transport_calls.append(request)
        if bad_prose == "empty_choices":
            return httpx.Response(200, json={"choices": []})
        output = {"requester_facts": ["Reported error"], "inferences": ["Needs review"],
                  "missing_information": ["timestamp"], "reply_draft": "We recorded the issue."}
        if bad_prose == "empty_fact":
            output["requester_facts"] = [""]
        else:
            output["missing_information"] = ["synthetic sensitive body" * 30]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(output)}}]})

    service._client = llm.OpenAICompatibleClient(
        api_key="synthetic-key", base_url="https://llm.test/v1", model="synthetic-prose-model",
        transport=httpx.MockTransport(handler),
    )
    if reanalysis:
        response = client.post(
            f"/cases/{initial['case_id']}/clarifications", json={"text": "More info"}
        )
    else:
        response = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert response.status_code == (200 if reanalysis else 201), response.text
    data = response.json()
    assert data["actual_mode"] == data["triage_mode"] == "jev"
    assert data["decision_metadata"]["fallback_reason"] is None
    assert data["prose_provider"] == "deterministic_fallback"
    assert data["prose_fallback_reason"] == "provider_output_unavailable"
    assert "synthetic sensitive" not in response.text
    assert len(transport_calls) == 1
    assert decision.calls == (2 if reanalysis else 1)
    assert prose.decision_calls == 0
    assert_gate(data, factory)


@pytest.mark.parametrize("initial_fallback", [False, True])
def test_jev_requested_mode_survives_actual_mode_changes_and_replay(
    harness, factory, initial_fallback,
):
    client, prose, decision, _ = harness
    fallback_adapter = JevDecisionService(Settings(_env_file=None, jev_api_key=None))
    decision.delegate = fallback_adapter if initial_fallback else None
    initial = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"}).json()
    initial_revision = deepcopy(initial["revisions"][0])
    decision.delegate = None if initial_fallback else fallback_adapter
    prose.failure = True
    path = f"/cases/{initial['case_id']}/clarifications"
    payload = {"text": "Provider changed; preserve requested mode", "idempotency_key": "transition"}
    response = client.post(path, json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["triage_mode"] == "jev"
    assert data["actual_mode"] == ("jev" if initial_fallback else "deterministic_fallback")
    assert data["revisions"][0] == initial_revision
    assert data["revisions"][0]["actual_mode"] == (
        "deterministic_fallback" if initial_fallback else "jev"
    )
    assert data["revisions"][1]["decision_metadata"]["fallback_reason"] == (
        None if initial_fallback else "jev_not_configured"
    )
    assert data["prose_fallback_reason"] == "provider_output_unavailable"
    decision.delegate = fallback_adapter if initial_fallback else None
    prose.failure = False
    assert client.post(path, json=payload).json() == data
    assert client.get(f"/cases/{data['case_id']}").json() == data
    assert decision.calls == prose.prose_calls == 2
    assert prose.decision_calls == 0
    assert_gate(data, factory)


def test_api_constructs_real_unconfigured_jev_adapter_without_live_calls(
    harness, factory, monkeypatch,
):
    client, prose, _, _ = harness
    monkeypatch.setattr(cases, "JevDecisionService", JevDecisionService)
    response = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["actual_mode"] == "deterministic_fallback"
    assert data["decision_metadata"]["fallback_reason"] == "jev_not_configured"
    assert prose.decision_calls == 0
    assert prose.prose_calls == 1
    assert_gate(data, factory)


def test_real_adapter_metadata_is_preserved_in_checkpoint_and_every_revision(harness, factory):
    client, prose, decision, _ = harness
    transport_calls = []
    payload = {
        "model": "typesafe/jev-1.13-20261001", "provider": "TypeSafe",
        "answers": {
            "category": {
                "type": "choice", "choice": "support/request", "confidence": 1.0,
                "probabilities": {
                    key: float(key == "support/request") for key in CATEGORY_CRITERIA
                },
            },
            "priority": {
                "type": "score", "score": 1.0, "confidence": 1.0,
                "legend": {str(i): text for i, text in enumerate(PRIORITY_CRITERIA)},
                "probabilities": {str(i): float(i == 1) for i in range(4)},
            },
            "risk": {
                "type": "choice", "choice": "low", "confidence": 1.0,
                "probabilities": {"low": 1.0, "medium": 0.0, "high": 0.0},
            },
            "review_needed": {"type": "noul", "noul": 0.0},
        },
        "usage": {"input_tokens": 123, "output_tokens": 45, "cost": 0.001},
    }

    def handler(request):
        transport_calls.append(json.loads(request.content))
        return httpx.Response(200, json=payload)

    decision.delegate = JevDecisionService(
        Settings(_env_file=None, jev_api_key=None),
        client=JevClient(api_key="synthetic-key", transport=httpx.MockTransport(handler)),
    )
    created = client.post("/cases", json={"request_text": REQUEST, "triage_mode": "jev"})
    assert created.status_code == 201, created.text
    initial = created.json()
    response = client.post(
        f"/cases/{initial['case_id']}/clarifications", json={"text": "More context"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["revisions"][0] == initial["revisions"][0]
    for revision in data["revisions"]:
        metadata = revision["decision_metadata"]
        assert revision["actual_mode"] == "jev"
        assert metadata["provider"] == "openrouter/TypeSafe"
        assert metadata["model"] == payload["model"]
        assert metadata["requested_model"] == "typesafe/jev-1.13"
        assert metadata["model_version"] is None
        assert metadata["usage"] == {"input_tokens": 123, "output_tokens": 45}
        assert metadata["cost"] == 0.001
        assert metadata["cost_source"] == "provider_usage"
        assert metadata["wall_time_ms"] >= 0
        assert metadata["rubric_version"] == "support-triage-v1"
        assert metadata["fallback_reason"] is None
    assert client.get(f"/cases/{data['case_id']}").json() == data
    with factory() as session:
        state = CaseRepository(session).load_workflow_state(UUID(data["case_id"]))
        assert state["revisions"] == data["revisions"]
        assert state["decision_metadata"] == data["decision_metadata"]
    assert len(transport_calls) == decision.calls == prose.prose_calls == 2
    assert prose.decision_calls == 0
    assert transport_calls[0]["state"]["request"] == REQUEST
    assert "More context" in transport_calls[1]["state"]["request"]
    assert transport_calls[0]["state"]["evidence"]
    assert_gate(data, factory)
