# Architecture

## Design principles

1. **Explicit workflow, bounded autonomy.** The implementation uses one stateful graph with visible nodes and conditional routing. It does not simulate a team of agents.
2. **Evidence before recommendation.** The resolution brief separates requester facts, tool evidence and model inference.
3. **Deterministic policy gates.** Permission to execute a write action is enforced by code and persisted approval state, not by an LLM instruction.
4. **Human edits are first-class state.** Review is not a side comment: edited values become the case's effective final state and are auditable.
5. **Offline repeatability first.** Fixture-backed tools and deterministic triage support tests and demos without credentials or network access.
6. **Safe degradation.** Insufficient evidence routes to clarification or human review, never confident fabrication.

## System context

```text
API client / Swagger
        |
        v
FastAPI case API -------------------------+
        |                                 |
        v                                 v
PostgreSQL case store              audit event store
        |
        v
LangGraph case workflow
  | intake / triage
  | evidence gathering
  | resolution brief
  | policy gate
  | interrupt for review
  | approved execution
        |
        +--> knowledge tool (fixtures)
        +--> similar-case tool (fixtures)
        +--> service-status tool (fixtures)
        +--> mock ticketing write tool
```

## Graph nodes

| Node | Input | Output | External effect |
|---|---|---|---|
| `intake` | raw request | case ID, requester facts | persists case/audit only |
| `triage` | request text | category, priority, risk, missing data | none |
| `gather_evidence` | normalized query | knowledge, status, similar-case evidence | read-only fixture tools |
| `build_brief` | triage + evidence | resolution brief, reply draft, action proposal | none |
| `policy_gate` | proposal + risk | `awaiting_human_review` or safe completion | none |
| `human_review` | persisted case | edit/approve/reject decision | graph interrupt/pause |
| `execute_approved_action` | persisted approved proposal | mock ticket record | fixture write only |
| `finalize` | effective case state | final reply/status/audit event | persists state |

A real LLM, when added, is only allowed in `triage` and `build_brief`, and must return structured data validated at the boundary. It does not receive a write capability directly.

## State model

The durable state must include at least:

```text
Case
- id, raw_request, status, created_at, updated_at
- requester_facts[]
- triage {category, priority, risk, confidence, missing_information[]}
- evidence[] {source_type, source_id, excerpt, tool_name, observed_at}
- proposed_actions[] {kind, payload_preview, risk, approval_required, state}
- reply_draft
- final_reply
- review {actor, edits, decision, comment, reviewed_at}

AuditEvent
- id, case_id, sequence, timestamp
- event_type
- actor_type and actor_id
- node/tool/action name
- input_summary, output_summary
- correlation_id
```

The audit log stores safe summaries rather than secrets or raw provider credentials.

## Tool contracts

### Read-only tools

```python
search_knowledge(query: str, filters: dict) -> list[Evidence]
find_similar_cases(summary: str) -> list[Evidence]
check_service_status(service: str | None) -> list[Evidence]
```

Their fixture outputs need stable source IDs and concise excerpts so a reviewer can trace every claim in the brief.

### Write tool

```python
create_incident_draft(case: Case) -> ProposedAction
execute_mock_incident(action_id: str, approval_id: str) -> ExecutionResult
```

`execute_mock_incident` validates all conditions atomically:

- action exists and is in `approved` state;
- approval is bound to the same action and case;
- action has not already been executed.

If outcome is unknown in a future real integration, the system must record `reconciliation_required`; it must not blindly retry a create operation.

## Human review contract

The review endpoint accepts a typed payload such as:

```json
{
  "actor": "operator@example.test",
  "edits": {
    "priority": "P2",
    "reply_draft": "Updated operator response"
  },
  "decision": "approve",
  "comment": "Confirmed impact with team lead"
}
```

The system records both the pre-review proposal and effective post-review values. It must reject attempts to approve a missing proposal or execute a rejected action.

## Persistence choice

PostgreSQL is the target datastore because it supports durable case state, audit records and future LangGraph checkpoint persistence. The first implementation may use a replaceable in-memory repository for fast unit tests, but its public repository interface must match the PostgreSQL implementation.

### Implemented persistence foundation

The application currently has a SQLAlchemy 2 repository and Alembic baseline
migration for the `cases` table. `CaseRecord` persists only `id`,
`raw_request`, `status`, `created_at`, and `updated_at`; it deliberately does
not yet expose a case API or claim to persist the future domain contract.

`CaseRepository.create` commits and refreshes the record, while `get` reloads
it by UUID. The integration test uses a separate database selected through
`TEST_DATABASE_URL` and truncates only that database's `cases` table. Docker
Compose supplies PostgreSQL 16 and starts the API only after the database
health check passes; the API container runs `alembic upgrade head` before
Uvicorn starts.

## Observability

The MVP uses its own persisted audit events as the source of truth for the user-visible trace. Optional OpenTelemetry/Langfuse integration can be added later, but it must not replace application-level evidence, policy decisions or approval records.

## Security boundaries

- Input and retrieved documents are untrusted text. Do not allow them to override tool policy or system instructions.
- The initial project uses no real customer data and no secrets.
- No endpoint may execute a write tool merely because a model output asks for it.
- Avoid logging full sensitive request content if real integrations are later introduced; define redaction first.
- API auth is out of MVP scope; therefore the demo must remain local-only until an authentication model exists.
