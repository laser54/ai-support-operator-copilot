# Demo contract

## Purpose

The demo proves a controlled agentic workflow, not an autonomous chatbot. A viewer should be able to inspect the request, each evidence-gathering step, the human correction, and the fact that execution stayed blocked until approval.

## Prerequisites

The implementation will document exact setup commands once the application exists. The intended local entrypoint is FastAPI with interactive docs at `/docs`.

## Script

### 1. Create a case

Send:

```json
{
  "request_text": "After the update, sales employees cannot sign in to the portal: they see a 500 error. This is urgent."
}
```

Expected visible results:

- case status is `awaiting_human_review`;
- triage is `incident`, `P1`, `high` risk;
- the brief contains requester facts and missing information;
- trace records calls to knowledge, similar-case and service-status tools;
- a `create_incident` action exists but has status `proposed` or `awaiting_approval`;
- mock ticket store is still empty.

### 2. Inspect the trace

Retrieve the case trace. Show the ordered events:

```text
case_created
triage_completed
knowledge_searched
similar_cases_found
service_status_checked
brief_built
action_proposed
human_review_requested
```

The trace must expose source IDs/excerpts, not opaque assertions such as “the agent checked everything”.

### 3. Review and edit

Submit a review that changes priority from P1 to P2 and replaces the reply draft. Confirm:

- the original proposal is still preserved;
- effective case fields show the operator's corrected values;
- an audit event names the human actor and changed fields;
- no external action has run yet if the decision is only `edit`.

### 4. Approve action

Submit `approve` for the same action. Confirm:

- exactly one mock incident record is created;
- case/action status is `executed`;
- audit trail records the approval and execution result;
- the final reply is available.

### 5. Safety negative test

Create a second case and submit `reject`. Confirm that no mock ticket is created and the audit trail explains the decision.

## Automated acceptance tests

The test suite must cover each proof point in this script. A manually observed API run is supplementary evidence, never a substitute for tests.

## Portfolio narrative

> AI Support Operator Copilot turns incomplete support messages into a case with explicit facts, evidence, uncertainty and a proposed next step. A LangGraph workflow invokes bounded read-only tools, then pauses for a human to edit or approve the result. Write actions are deterministic and structurally blocked until that approval is persisted; every step is visible in an audit trail.

## Honest boundaries

- The first version uses synthetic fixtures and a mock ticket executor.
- It does not prove real support quality, time savings or production readiness.
- The trace is application audit evidence, not a claim of complete LLM observability coverage.
- A production connector would need authentication, authorization, idempotency and reconciliation handling before it can create external tickets.
