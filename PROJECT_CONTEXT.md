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
  demonstration layer. A focused reviewer frontend is planned only after the
  API workflow is complete.
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
  tools/           Fixture-backed read-only and mock write tools
  repositories/    Persistence interfaces and implementations
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
- No premature vector DB or auth. A thin reviewer frontend is deferred until the
  API MVP is complete and will use Vercel Hobby for personal, non-commercial
  frontend hosting only; backend, database, secrets and policy enforcement stay
  outside the browser.

## Verification target

A reviewer should be able to run tests and follow one documented demo from request to human approval, inspect the exact tool calls/evidence, and verify that the action was impossible before approval.

## Current implementation snapshot

Phases 2 and 3 are complete: PostgreSQL 16 is available through `compose.yaml`,
and the application has a SQLAlchemy 2 `CaseRepository` with an Alembic
baseline migration for the minimal `cases` table. Strict Pydantic workflow
contracts and deterministic synthetic fixture catalogues now cover the login
HTTP 500 after update scenario. Fixture-backed read-only tools return traceable
evidence and the PostgreSQL audit trail persists safe, ordered tool-call events.
Triage and brief generation now have a validated OpenAI-compatible boundary and
deterministic offline fallback; neither provider output nor fallback can
authorize or execute an action. The normal test suite skips the PostgreSQL
integration test unless `TEST_DATABASE_URL` identifies a dedicated disposable
database. The explicit LangGraph intake workflow is now available through
`POST /cases` and `GET /cases/{case_id}`; it persists a checkpoint, gathers
three fixture evidence sources, and stops at `awaiting_human_review` with no
execution edge. Typed review edits, approval/rejection, exactly-once mock
execution, and the ordered trace endpoint are now implemented. The next
roadmap phase is an optional deferred reviewer frontend. The API MVP has CI,
Docker health checks, an executable local demo, and a deterministic no-key
fallback; it is ready to run locally without LLM credentials.

The reviewer frontend foundation is in `frontend/`. `docs/frontend-plan.md` is
its authoritative product and implementation specification. Subphases 9.1–9.7
are implemented: scaffold, typed API client, design tokens, primitives, product
entry, case intake, reviewer workspace, human edits, the decision gate, the
audit trace experience, and end-to-end quality checks. FastAPI retains all
approval, execution, idempotency, and security enforcement. The browser
receives only `VITE_API_BASE_URL`. Case API responses include `request_text`.
