# Demo contract

## Purpose

The demo proves a controlled agentic workflow, not an autonomous chatbot. A viewer should be able to inspect the request, each evidence-gathering step, the human correction, and the fact that execution stayed blocked until approval.

## Current trace foundation

The fixture-backed evidence sources for the canonical login HTTP 500 after an
update scenario are deterministic: `kb-auth-5xx-after-release`, `inc-104`, and
`status-portal-auth-5xx`. The workflow persists each corresponding tool call as
an ordered audit event with safe summaries.

## Prerequisites

Run `docker compose up --build`, wait for the API health check, and open
`http://127.0.0.1:8000/docs`. No LLM credentials are needed for this demo;
the deterministic fallback supplies triage and the draft response.

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
- the persisted audit trail records calls to knowledge, similar-case and
  service-status tools;
- a `create_incident` action exists with status `proposed`;
- mock ticket store is still empty.

### 2. Inspect the trace

Retrieve the case trace. Show the ordered events:

```text
case_created
tool_called (search_knowledge)
tool_called (find_similar_cases)
tool_called (check_service_status)
brief_built
human_review_requested
```

The trace must expose source IDs/excerpts, not opaque assertions such as “the agent checked everything”.

### 3. Review and edit

Send `POST /cases/{id}/review` with decision `approve`, changing priority from
P1 to P2 and replacing the reply draft. Confirm:

- the original proposal is still preserved;
- effective case fields show the operator's corrected values;
- an audit event names the human actor and changed fields;
- the response contains one `MOCK-...` incident reference after approval.

### 4. Approve action

Repeat the same `approve` request. Confirm:

- exactly one mock incident record is created;
- case/action status is `completed`/`executed`;
- audit trail records the approval and execution result;
- the final reply is available.

### 5. Safety negative test

Create a second case and submit `reject`. Confirm that no mock ticket is created,
all actions are rejected, and the audit trail explains the decision.

## Automated acceptance tests

The test suite must cover each proof point in this script. A manually observed API run is supplementary evidence, never a substitute for tests.

## Portfolio narrative

> AI Support Operator Copilot turns incomplete support messages into a case with explicit facts, evidence, uncertainty and a proposed next step. A LangGraph workflow invokes bounded read-only tools, then pauses for a human to edit or approve the result. Write actions are deterministic and structurally blocked until that approval is persisted; every step is visible in an audit trail.

## Honest boundaries

- The first version uses synthetic fixtures and a mock ticket executor.
- It does not prove real support quality, time savings or production readiness.
- The trace is application audit evidence, not a claim of complete LLM observability coverage.
- A production connector would need authentication, authorization, idempotency and reconciliation handling before it can create external tickets.
