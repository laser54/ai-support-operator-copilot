# AI Support Operator Copilot — Project Context

## Mission

Build a small but genuinely working API-first product: AI helps an operator
analyze an unstructured support request, presents evidence and a proposed next
step, and then requires a human to edit the result and authorize any external
action. The system must be explainable and safe rather than behave like an
unconstrained chatbot.

## Fixed decisions

- This is a new standalone private repository, not a fork of
  `support_operator_panel` or a rewrite of `assist-craft-qna`.
- The API MVP uses FastAPI documentation, JSON, and tests as its primary
  demonstration layer. A focused reviewer frontend exists in `frontend/`
  (phase 9.1–9.7). Static Vercel Hobby deploy is still planned (9.8).
- Use fixture and mock data only. Do not use real customer data, tokens, CRM, or
  ticketing integrations.
- Use one explicit LangGraph workflow rather than a multi-agent supervisor
  hierarchy.
- Retrieval and knowledge access are tools within the workflow, not independent
  agents.
- Every write operation requires persisted human approval. The mock executor
  proves this boundary without creating an external side effect.
- Do not claim production readiness, measured quality, or business results
  without evidence.

## First vertical slice

Input: an unstructured report of a login failure after an update.

Expected path:

```text
POST /cases
  -> triage: incident, P1, high risk
  -> search_knowledge
  -> find_similar_cases
  -> check_service_status
  -> resolution brief + create_incident proposal
  -> awaiting_human_review
```

The action must not execute on this request.

Then:

```text
POST /cases/{id}/review
  -> operator can correct priority/edit reply/approve
  -> approved create_incident executes once in mock ticketing store
  -> audit event records actor, decision and result
```

## Evidence contract

A resolution brief should explicitly separate:

- user-provided facts;
- tool evidence with source IDs;
- model inferences and confidence;
- missing information;
- proposed actions and their risk;
- operator edits and final decision.

## Proposed directory layout

```text
app/
  api/             HTTP routes and schemas
  domain/          Case, evidence, action and audit models
  graph/           LangGraph state, nodes and transitions
  llm/             OpenAI-compatible boundary and offline fallback
  persistence/     SQLAlchemy models, repositories, database session
  tools/           Fixture-backed read-only and mock write tools
frontend/          Reviewer SPA (Vite/React)
fixtures/
  knowledge/
  similar_cases.json
  service_status.json
tests/
docs/
```

## Do not do

- No generic autonomous reply loop.
- No auto-send, auto-ticket creation or other external side effects.
- No web scraping or production integrations in the MVP.
- No “agent memory” feature until persisted case/audit state works.
- No premature vector DB or auth. The thin reviewer frontend is implemented
  for the local demo; Vercel Hobby remains the planned personal/non-commercial
  frontend host. Backend, database, secrets and policy enforcement stay
  outside the browser.

## Verification target

A reviewer should be able to run tests and follow one documented demo from request to human approval, inspect the exact tool calls/evidence, and verify that the action was impossible before approval.

## Current implementation snapshot

Phases 1–8 are complete. The API MVP runs locally with Docker Compose:
PostgreSQL 16, Alembic migrations, LangGraph intake through the human gate,
fixture-backed tools, mock incident execution, and an ordered audit trace.
Triage uses an OpenAI-compatible JSON boundary (OpenCode Go / DeepSeek V4
Flash when `LLM_*` are set) with a request-shaped deterministic fallback.
Compose forwards `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` into the API
container. Case responses include `request_text`, `provider`,
`fallback_reason`, and `model`.

Synthetic catalogues cover five demo families (portal login 500, VPN
certificate, invoice PDF timeout, outbound email delay, SSO MFA loop). Tools
match fixture keywords as substrings of the request text. The canonical
login-500 path still returns `kb-auth-5xx-after-release`, `inc-104`, and
`status-portal-auth-5xx`.

The reviewer SPA (`frontend/`) implements subphases 9.1–9.7: intake with five
demo chips, denser dark workspace, AI provenance (`AI · {model}` or
`Offline fallback`), edits, decision gate, and trace. FastAPI retains
approval, execution, idempotency, and security enforcement. The browser
receives only `VITE_API_BASE_URL`. Next planned work is subphase 9.8
(Vercel Hobby SPA deploy). Public backend hosting is out of that subphase.
