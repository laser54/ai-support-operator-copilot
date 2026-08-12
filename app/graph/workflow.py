"""Case intake graph that always stops at the human policy gate."""

from datetime import UTC, datetime
from typing import TypedDict
from uuid import UUID, uuid4

from langgraph.graph import END, START, StateGraph

from app.audit import tool_call_event
from app.domain.contracts import ActorType, AuditEvent, Evidence
from app.llm.service import TriageAndBriefService
from app.persistence.repositories import CaseRepository
from app.tools.read_only import check_service_status, find_similar_cases, search_knowledge


class WorkflowState(TypedDict, total=False):
    """JSON-compatible state passed through the explicit graph nodes."""

    case_id: str
    request_text: str
    status: str
    evidence: list[dict[str, object]]
    triage: dict[str, object]
    resolution_brief: dict[str, object]
    provider: str
    fallback_reason: str | None


class CaseWorkflow:
    """Execute intake, evidence, brief, and policy-gate nodes for one case."""

    def __init__(self, repository: CaseRepository, service: TriageAndBriefService) -> None:
        self._repository = repository
        self._service = service
        graph = StateGraph(WorkflowState)
        graph.add_node("intake", self._intake)
        graph.add_node("gather_evidence", self._gather_evidence)
        graph.add_node("build_brief", self._build_brief)
        graph.add_node("policy_gate", self._policy_gate)
        graph.add_edge(START, "intake")
        graph.add_edge("intake", "gather_evidence")
        graph.add_edge("gather_evidence", "build_brief")
        graph.add_edge("build_brief", "policy_gate")
        graph.add_edge("policy_gate", END)
        self._graph = graph.compile()

    def run(self, request_text: str) -> dict[str, object]:
        """Run to the mandatory human-review stop and persist the checkpoint."""

        state = self._graph.invoke({"request_text": request_text})
        case_id = UUID(str(state["case_id"]))
        serialized = dict(state)
        self._repository.save_workflow_state(case_id, serialized)
        return serialized

    def _intake(self, state: WorkflowState) -> WorkflowState:
        case = self._repository.create(state["request_text"])
        self._add_event(case.id, "case_created", "intake", {"request": state["request_text"]})
        return {"case_id": str(case.id), "status": "received"}

    def _gather_evidence(self, state: WorkflowState) -> WorkflowState:
        case_id = UUID(state["case_id"])
        request_text = state["request_text"]
        calls = [
            ("search_knowledge", {"query": request_text}, search_knowledge(request_text)),
            ("find_similar_cases", {"summary": request_text}, find_similar_cases(request_text)),
            (
                "check_service_status",
                {"service": "portal authentication"},
                check_service_status("portal authentication"),
            ),
        ]
        evidence: list[Evidence] = []
        for name, inputs, results in calls:
            evidence.extend(results)
            self._repository.add_audit_event(
                tool_call_event(
                    case_id=case_id,
                    tool_name=name,
                    inputs=inputs,
                    evidence_source_ids=[item.source_id for item in results],
                )
            )
        return {"evidence": [item.model_dump(mode="json") for item in evidence]}

    def _build_brief(self, state: WorkflowState) -> WorkflowState:
        case_id = UUID(state["case_id"])
        evidence = [Evidence.model_validate(item) for item in state["evidence"]]
        result = self._service.generate(state["request_text"], evidence)
        self._add_event(
            case_id,
            "brief_built",
            "build_brief",
            {"provider": result.provider, "evidence_count": len(evidence)},
        )
        return {
            "triage": result.triage.model_dump(mode="json"),
            "resolution_brief": result.brief.model_dump(mode="json"),
            "provider": result.provider,
            "fallback_reason": result.fallback_reason,
        }

    def _policy_gate(self, state: WorkflowState) -> WorkflowState:
        case_id = UUID(state["case_id"])
        self._add_event(
            case_id,
            "human_review_requested",
            "policy_gate",
            {"action_execution": "blocked_pending_human_review"},
        )
        return {"status": "awaiting_human_review"}

    def _add_event(
        self, case_id: UUID, event_type: str, name: str, values: dict[str, object]
    ) -> AuditEvent:
        event = AuditEvent(
            case_id=case_id,
            sequence=1,
            timestamp=datetime.now(UTC),
            event_type=event_type,
            actor_type=ActorType.SYSTEM,
            actor_id="case-workflow",
            name=name,
            input_summary="workflow_input=metadata_only",
            output_summary="; ".join(f"{key}={value}" for key, value in values.items())[:2_000],
            correlation_id=uuid4(),
        )
        return self._repository.add_audit_event(event)
