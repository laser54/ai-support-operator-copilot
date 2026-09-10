"""Case intake graph that always stops at the human policy gate."""

from datetime import UTC, datetime
from typing import TypedDict, cast
from uuid import UUID, uuid4

from langgraph.graph import END, START, StateGraph

from app.audit import tool_call_event
from app.domain.contracts import ActorType, AuditEvent, Clarification, Evidence
from app.llm.service import TriageAndBriefService
from app.persistence.repositories import CaseRepository
from app.review import CaseNotFoundError, ReviewConflictError
from app.tools.read_only import check_service_status, find_similar_cases, search_knowledge


class WorkflowState(TypedDict, total=False):
    """JSON-compatible state passed through the explicit graph nodes."""

    case_id: str
    request_text: str
    status: str
    version: int
    evidence: list[dict[str, object]]
    triage: dict[str, object]
    resolution_brief: dict[str, object]
    provider: str
    fallback_reason: str | None
    model: str | None
    clarifications: list[dict[str, object]]
    revisions: list[dict[str, object]]
    current_revision: int
    clarification_idempotency: dict[str, dict[str, str]]
    review: dict[str, object] | None
    review_draft: dict[str, object] | None


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
        now_iso = datetime.now(UTC).isoformat()
        revision_1: dict[str, object] = {
            "revision_number": 1,
            "created_at": now_iso,
            "triggered_by": "intake",
            "clarification_id": None,
            "triage": serialized["triage"],
            "evidence": serialized["evidence"],
            "resolution_brief": serialized["resolution_brief"],
            "provider": serialized["provider"],
            "fallback_reason": serialized.get("fallback_reason"),
            "model": serialized.get("model"),
        }
        serialized["clarifications"] = []
        serialized["revisions"] = [revision_1]
        serialized["current_revision"] = 1
        serialized["clarification_idempotency"] = {}
        self._repository.save_workflow_state(case_id, serialized)
        return serialized

    def reanalyze(
        self,
        case_id: UUID,
        clarification_text: str,
        *,
        author: str = "requester",
        idempotency_key: str | None = None,
        discard_draft: bool = True,
    ) -> dict[str, object]:
        """Attach clarification, execute updated tools and LLM, and append revision."""
        if not clarification_text or not clarification_text.strip():
            raise ValueError("clarification text cannot be empty or blank")
        if len(clarification_text) > 10_000:
            raise ValueError("clarification text exceeds 10,000 characters limit")

        state = self._repository.load_workflow_state_for_update(case_id)
        if state is None:
            raise CaseNotFoundError("case not found")

        current_status = str(state.get("status", ""))
        if current_status in {"completed", "rejected"}:
            raise ReviewConflictError(
                f"case is in terminal status '{current_status}' and cannot be re-analyzed"
            )
        if current_status != "awaiting_human_review":
            raise ReviewConflictError(
                f"case is in status '{current_status}' and cannot be re-analyzed"
            )

        # Idempotency check
        idempotency_map = cast(
            dict[str, dict[str, str]], state.setdefault("clarification_idempotency", {})
        )
        if idempotency_key:
            if idempotency_key in idempotency_map:
                existing = idempotency_map[idempotency_key]
                if existing.get("text") == clarification_text and existing.get("author") == author:
                    return state
                raise ReviewConflictError(
                    "idempotency key already used with different clarification payload"
                )

        # Handle draft protection
        if discard_draft and state.get("review_draft"):
            self._add_event(
                case_id,
                "draft_discarded",
                "reanalyze",
                {"reason": "reanalysis_with_clarification"},
            )
            state["review_draft"] = None

        # Build new Clarification
        clarification_obj = Clarification(
            text=clarification_text,
            author=author,
            created_at=datetime.now(UTC),
        )
        clarification_record: dict[str, object] = {
            "id": str(clarification_obj.id),
            "text": clarification_obj.text,
            "author": clarification_obj.author,
            "created_at": clarification_obj.created_at.isoformat(),
        }

        clarifications = list(cast(list[dict[str, object]], state.get("clarifications", [])))
        clarifications.append(clarification_record)
        state["clarifications"] = clarifications

        self._add_event(
            case_id,
            "clarification_added",
            "clarification",
            {
                "clarification_id": str(clarification_obj.id),
                "author": author,
                "text_preview": clarification_text[:100],
            },
        )

        # Ensure revisions list exists (synthesize revision 1 for legacy states if needed)
        revisions = list(cast(list[dict[str, object]], state.get("revisions", [])))
        if not revisions:
            revisions = [
                {
                    "revision_number": 1,
                    "created_at": str(state.get("created_at") or datetime.now(UTC).isoformat()),
                    "triggered_by": "intake",
                    "clarification_id": None,
                    "triage": state.get("triage") or {},
                    "evidence": state.get("evidence") or [],
                    "resolution_brief": state.get("resolution_brief") or {},
                    "provider": str(state.get("provider") or "deterministic_fallback"),
                    "fallback_reason": state.get("fallback_reason"),
                    "model": state.get("model"),
                }
            ]

        next_rev_num = len(revisions) + 1

        # Compose combined text for re-analysis
        raw_request = str(state.get("request_text", ""))
        combined_parts = [raw_request]
        for c in clarifications:
            c_auth = str(c.get("author", "requester"))
            c_txt = str(c.get("text", ""))
            combined_parts.append(f"[Clarification by {c_auth}]:\n{c_txt}")
        combined_text = "\n\n".join(combined_parts)

        # Gather updated evidence
        calls = [
            ("search_knowledge", {"query": combined_text}, search_knowledge(combined_text)),
            ("find_similar_cases", {"summary": combined_text}, find_similar_cases(combined_text)),
            (
                "check_service_status",
                {"service": combined_text},
                check_service_status(combined_text),
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

        # Build new brief
        result = self._service.generate(combined_text, evidence)
        self._add_event(
            case_id,
            "brief_built",
            "build_brief",
            {
                "provider": result.provider,
                "evidence_count": len(evidence),
                "revision": next_rev_num,
            },
        )

        # Human review requested (policy gate stop)
        self._add_event(
            case_id,
            "human_review_requested",
            "policy_gate",
            {
                "action_execution": "blocked_pending_human_review",
                "revision": next_rev_num,
            },
        )

        # Create new revision snapshot
        now_iso = datetime.now(UTC).isoformat()
        new_revision: dict[str, object] = {
            "revision_number": next_rev_num,
            "created_at": now_iso,
            "triggered_by": "clarification",
            "clarification_id": str(clarification_obj.id),
            "triage": result.triage.model_dump(mode="json"),
            "evidence": [item.model_dump(mode="json") for item in evidence],
            "resolution_brief": result.brief.model_dump(mode="json"),
            "provider": result.provider,
            "fallback_reason": result.fallback_reason,
            "model": result.model,
        }
        revisions.append(new_revision)

        # Update state fields
        state["revisions"] = revisions
        state["current_revision"] = next_rev_num
        state["triage"] = new_revision["triage"]
        state["evidence"] = new_revision["evidence"]
        state["resolution_brief"] = new_revision["resolution_brief"]
        state["provider"] = new_revision["provider"]
        state["fallback_reason"] = new_revision["fallback_reason"]
        state["model"] = new_revision["model"]
        state["status"] = "awaiting_human_review"

        # Monotonic version increment for optimistic concurrency
        current_version = int(str(state.get("version", 1)))
        state["version"] = current_version + 1

        if idempotency_key:
            idempotency_map[idempotency_key] = {
                "clarification_id": str(clarification_obj.id),
                "text": clarification_text,
                "author": author,
                "revision_number": str(next_rev_num),
            }
            state["clarification_idempotency"] = idempotency_map

        self._repository.save_workflow_state(case_id, state)
        return state

    def _intake(self, state: WorkflowState) -> WorkflowState:
        case = self._repository.create(state["request_text"])
        self._add_event(case.id, "case_created", "intake", {"request": state["request_text"]})
        return {"case_id": str(case.id), "status": "received", "version": 1}

    def _gather_evidence(self, state: WorkflowState) -> WorkflowState:
        case_id = UUID(state["case_id"])
        request_text = state["request_text"]
        calls = [
            ("search_knowledge", {"query": request_text}, search_knowledge(request_text)),
            ("find_similar_cases", {"summary": request_text}, find_similar_cases(request_text)),
            (
                "check_service_status",
                {"service": request_text},
                check_service_status(request_text),
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
            "model": result.model,
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
