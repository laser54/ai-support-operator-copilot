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

### Implemented intake graph and checkpoints

The initial `CaseWorkflow` is an explicit LangGraph state graph with `intake`,
`gather_evidence`, `build_brief`, and `policy_gate` nodes. It runs synchronously
from `POST /cases` and always terminates at `awaiting_human_review`; there is no
edge from this graph to an executor. The graph records creation, every tool
call, brief construction, and the policy gate in the ordered audit trail.

The latest JSON-safe graph state is stored with the case and mirrored in the
`workflow_checkpoints` table. `GET /cases/{case_id}` returns that latest
checkpoint. This provides durable pause state for the review phase; it does not
yet support a general graph-resume interface; the review and trace endpoints
operate on the persisted checkpoint and audit trail.

### Implemented model boundary and fallback

`app.llm.service` implements the analytical model boundary. The
OpenAI-compatible adapter requests JSON with an explicit `ModelOutput` contract,
uses `temperature: 0`, and validates the result as `ModelOutput`, which contains
only triage, facts, inferences, missing information, and a reply draft. It
cannot supply actions, approvals, execution state, or tool results.
Application code constructs the two proposal drafts after validation, so each
write-capable action remains `proposed` and requires the later policy gate.

The default local configuration targets OpenCode Go's
`https://opencode.ai/zen/go/v1` endpoint with `deepseek-v4-flash`. Its base URL
excludes `/chat/completions` because the adapter appends that path.

When `LLM_API_KEY`, `LLM_BASE_URL`, or `LLM_MODEL` is absent, or when a provider
request or validation fails, `TriageAndBriefService` returns a deterministic
offline result. Its result reports only bounded fallback reasons
(`provider_not_configured` or `provider_output_unavailable`), never a provider
exception message, response body, or credential.

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

### Implemented domain contracts and fixtures

The `app.domain.contracts` module now provides Pydantic v2, `extra="forbid"`
contracts for `Case`, `Triage`, `Evidence`, `ResolutionBrief`,
`ProposedAction`, `Review`, `AuditEvent`, and `ExecutionResult`, plus their
bounded lifecycle enums. The contracts validate priority, risk, timestamps,
traceable source IDs, review edits, and execution outcomes. In particular, a
successful mock execution needs an external reference; the contract does not
make a provider-side effect possible.

`fixtures/` contains schema-validated, deterministic synthetic catalogues for
the login HTTP 500 after update scenario. Their stable IDs are
`kb-auth-5xx-after-release`, `inc-104`, and `status-portal-auth-5xx`; the
implemented read-only tools return them as traceable evidence.

## Tool contracts

### Read-only tools

```python
search_knowledge(query: str, filters: dict) -> list[Evidence]
find_similar_cases(summary: str) -> list[Evidence]
check_service_status(service: str | None) -> list[Evidence]
```

Their fixture outputs need stable source IDs and concise excerpts so a reviewer can trace every claim in the brief.

### Implemented fixture tools and audit semantics

The three read-only tools are now implemented in `app.tools.read_only`. They
search only the committed synthetic fixture catalogues and return validated
`Evidence` with the originating stable ID and tool name. They make no network
request and have no write capability.

Every tool call can be converted to a persisted `AuditEvent` with
`tool_call_event`. Input summaries retain only structural metadata, such as a
text length; field names matching credentials or secrets are redacted. Output
summaries retain the fixture evidence source IDs used by the caller. The
`audit_events` table enforces a unique `(case_id, sequence)` pair, and the
repository assigns the next sequence and reloads traces in ascending order.
The trace is durable and exposed through `GET /cases/{case_id}/trace`; the
frontend must preserve its backend sequence order.

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

### Implemented review and idempotency behavior

`POST /cases/{case_id}/review` accepts typed edits and a persisted decision.
Edits replace the effective triage priority, reply draft, and/or requester facts
in the checkpoint before finalization; the original proposal remains visible in
the audit history. Rejection changes proposals to `rejected`, stores the case
as `rejected`, and does not invoke the executor.

Approval binds the review ID to the `create_incident` proposal and inserts an
`action_id`-keyed row in `mock_incidents`. The primary key makes the mock
execution exactly once: repeated approval returns the existing mock reference
without writing a second execution event. Approval, rejection, and execution
are added to the ordered audit trail. `GET /cases/{case_id}/trace` exposes that
trace in sequence order.

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

## Planned reviewer frontend boundary

The planned reviewer UI is a static React/TypeScript application. It presents
the workflow and holds only temporary form state; FastAPI remains authoritative
for case state, review decisions, policy enforcement, execution idempotency, and
audit order. The browser receives an API base URL but no LLM or database
credentials. Browser integration requires an explicit CORS allowlist. Public
backend exposure remains out of scope until authentication is designed.

The detailed information architecture, visual direction, accessibility rules,
API prerequisites, testing matrix, and phased delivery plan are maintained in
[frontend-plan.md](frontend-plan.md).
