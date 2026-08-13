# MVP implementation roadmap

## Purpose and current status

This document is the authoritative sequential implementation guide for the repository. The product, architecture, and demo documents define the intended behavior; this roadmap records what has actually been implemented and what must happen next.

**Current milestone:** MVP vertical slice

**Current phase:** 9 — Reviewer frontend and Vercel Hobby deployment
**Overall status:** 9.2 complete; 9.3 is next

## Status legend

- **not started** — no implementation work has begun.
- **in progress** — the currently selected implementation step.
- **blocked** — cannot proceed because a concrete dependency is unavailable; record that dependency in this document.
- **completed** — acceptance criteria have passed and the completion record is present.

## Agent operating protocol

1. Before changing code, select the first eligible unchecked phase and mark it **in progress**. Do not begin a dependent phase until its dependency is completed, except for isolated preparatory work documented here.
2. Work test-first: add a focused failing behavioral test, implement the smallest safe change, then run focused and full relevant tests.
3. After all acceptance criteria pass, mark only that phase **completed** and add a completion record using the format below.
4. In the same change, update documentation affected by the implemented behavior. Keep planned behavior explicitly marked as planned; do not claim uncompleted phases are implemented.
5. Before handoff, verify documentation links and status claims, and confirm that no secrets, real customer data, or external side effects were added.

### Completion record format

Add one entry directly below the completed phase:

```text
Completed: YYYY-MM-DD
Scope: concise description of delivered behavior
Verification: exact command(s) run and result
Documentation: files updated, or "none — no externally visible documentation impact"
Follow-up: known limitation or next required step
```

For a blocked phase, add:

```text
Blocked: YYYY-MM-DD
Dependency: concrete unavailable prerequisite
Impact: work that cannot proceed
Resolution: condition required to resume
```

## Sequential phases

### 1. Project foundation — completed

**Dependencies:** none.

**Deliverables:** Python 3.12 package configuration managed with `uv`; FastAPI application skeleton; typed settings; `.env.example`; dependency and development tooling for linting, typing, and tests.

**Acceptance criteria:** `uv sync --all-groups` creates the Python 3.12 environment; the application imports and starts locally; settings load without requiring LLM credentials; a basic health/API test passes; tooling commands are documented and runnable from a fresh checkout.

**Required documentation updates:** `README.md` setup and run instructions; this roadmap completion record; any new configuration reference.

Completed: 2026-08-12
Scope: Added Python 3.12 `uv` package configuration and lockfile, FastAPI application skeleton with `GET /health`, typed optional LLM settings, environment template, ignore rules, and pytest/Ruff/mypy tooling.
Verification: `uv sync --all-groups` completed with CPython 3.12.13; `uv run pytest -q` passed (1 test); `uv run ruff check .` passed; `uv run mypy app` passed; settings/application import check passed.
Documentation: Updated `README.md` and this roadmap; added `.env.example`.
Follow-up: Begin phase 2 with PostgreSQL, SQLAlchemy, Alembic, Docker Compose, and an isolated integration-test database.

### 2. PostgreSQL foundation — completed

**Dependencies:** phase 1 completed.

**Deliverables:** Docker Compose for PostgreSQL and API; SQLAlchemy repository foundation; Alembic baseline migration; database lifecycle; integration-test database configuration.

**Acceptance criteria:** migrations apply to a clean PostgreSQL instance; repository smoke tests persist and reload data; integration tests use an isolated database.

**Required documentation updates:** `README.md` database, Compose, and migration commands; `docs/architecture.md` persistence implementation; this roadmap completion record.

Completed: 2026-08-12
Scope: Added a PostgreSQL 16 Docker Compose service and API container, SQLAlchemy 2 persistence foundation, `CaseRepository`, Alembic baseline migration for `cases`, and a PostgreSQL-only repository integration test.
Verification: With `DATABASE_URL=postgresql+psycopg://copilot:copilot@localhost:55432/copilot_test`, `uv run alembic upgrade head` applied revision `20260812_01`; `uv run pytest -q` passed (2 tests); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `README.md`, `docs/architecture.md`, and this roadmap.
Follow-up: Define typed domain contracts and deterministic synthetic fixtures in phase 3; extend persistence only when those contracts require it.

### 3. Domain contracts and fixtures — completed

**Dependencies:** phase 2 completed.

**Deliverables:** typed case, triage, evidence, resolution brief, proposed action, review, audit-event, and execution-result contracts; deterministic synthetic knowledge, similar-case, and service-status fixtures.

**Acceptance criteria:** contracts validate valid and invalid payloads; fixtures have stable source IDs and support the login HTTP 500 after update scenario; no fixture contains real customer data.

**Required documentation updates:** `docs/architecture.md` contract details; `docs/product.md` only if externally visible behavior differs; this roadmap completion record.

Completed: 2026-08-12
Scope: Added strict Pydantic contracts for cases, triage, evidence, briefs, actions, reviews, audit events, and execution results; added schema-validated deterministic synthetic knowledge, similar-case, and service-status fixture catalogues.
Verification: `uv run pytest -q` passed (5 tests, 1 PostgreSQL test skipped without `TEST_DATABASE_URL`); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `docs/architecture.md`, `PROJECT_CONTEXT.md`, and this roadmap; `docs/product.md` unchanged because the implemented fixture scenario matches its existing MVP description.
Follow-up: Implement fixture-backed read-only tools and persist ordered audit events in phase 4.

### 4. Read-only tools and audit trail — completed

**Dependencies:** phase 3 completed.

**Deliverables:** fixture-backed knowledge, similar-case, and service-status tools; persisted, ordered audit events for case lifecycle and every tool call.

**Acceptance criteria:** each read-only tool returns traceable evidence; tool calls have stable event ordering and safe input/output summaries; audit events persist and reload with the case.

**Required documentation updates:** `docs/architecture.md` tools and audit semantics; `docs/demo.md` trace expectations; this roadmap completion record.

Completed: 2026-08-12
Scope: Added deterministic fixture-backed knowledge, similar-case, and service-status tools; added safe tool-call audit-event construction; persisted ordered case audit events with an Alembic migration and PostgreSQL repository methods.
Verification: In a clean Docker PostgreSQL database, `uv run alembic upgrade head` applied revisions `20260812_01` and `20260812_02`; `uv run pytest -q` passed (10 tests); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `docs/architecture.md`, `docs/demo.md`, `PROJECT_CONTEXT.md`, and this roadmap.
Follow-up: Implement validated LLM triage and resolution-brief generation with deterministic offline fallback in phase 5.

### 5. Triage and brief generation — completed

**Dependencies:** phase 4 completed.

**Deliverables:** OpenAI-compatible structured LLM adapter; Pydantic boundary validation; deterministic offline fallback; missing-information handling; safe recording of provider errors without secrets.

**Acceptance criteria:** configured endpoint yields validated typed output; missing credentials, invalid structured output, and provider failures select the deterministic fallback; no model output can grant write permission.

**Required documentation updates:** `README.md` LLM configuration and fallback; `docs/architecture.md` model boundary and failure behavior; this roadmap completion record.

Completed: 2026-08-12
Scope: Added an OpenAI-compatible structured-output adapter, strict provider-boundary validation, deterministic offline triage and brief fallback, missing-information handling, and bounded non-secret fallback reasons.
Verification: `uv run pytest -q` passed (11 tests, 2 PostgreSQL tests skipped without `TEST_DATABASE_URL`); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `README.md`, `docs/architecture.md`, `PROJECT_CONTEXT.md`, and this roadmap.
Follow-up: Build the persisted LangGraph workflow and case intake/read API in phase 6.

Updated: 2026-08-13
Scope: Hardened the OpenAI-compatible prompt with the complete typed JSON contract and constrained sampling; added a transport-level regression test for the payload and validation path; configured .env.example for OpenCode Go DeepSeek V4 Flash.
Verification: OpenCode Go provider smoke test returned openai_compatible with P1/high triage and no fallback; `uv run pytest tests/test_llm_service.py -q` passed (4 tests); `uv run ruff check app tests` and `uv run mypy app` passed.
Documentation: Updated .env.example, README.md, docs/architecture.md, and this roadmap.
Follow-up: Keep the deterministic fallback enabled and add broader scenario evaluation before relying on provider output beyond the MVP fixtures.

### 6. LangGraph workflow and intake API — completed

**Dependencies:** phase 5 completed.

**Deliverables:** persisted LangGraph state/checkpoints; intake, triage, evidence, brief, and policy-gate nodes; `POST /cases` and `GET /cases/{case_id}`.

**Acceptance criteria:** the canonical login-500 request creates an incident case with typed triage, three evidence sources, a proposed action, and `awaiting_human_review`; action execution remains impossible at the gate.

**Required documentation updates:** `README.md` implemented endpoint surface; `docs/architecture.md` workflow/data flow; `docs/demo.md` create-and-inspect steps; this roadmap completion record.

Completed: 2026-08-12
Scope: Added an explicit LangGraph intake workflow, JSON-safe PostgreSQL case checkpoints, intake/read API endpoints, and an API integration test for the canonical login HTTP 500 scenario.
Verification: In a clean Docker PostgreSQL database, `uv run alembic upgrade head` applied revisions through `20260812_03`; `uv run pytest -q` passed (14 tests); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `README.md`, `docs/architecture.md`, `docs/demo.md`, `PROJECT_CONTEXT.md`, and this roadmap.
Follow-up: Add review decisions, persisted approvals, the mock executor, and the trace endpoint in phase 7.

### 7. Human review and mock execution — completed

**Dependencies:** phase 6 completed.

**Deliverables:** review edit/approve/reject flow; persisted approval; atomic exactly-once mock incident execution; finalization; `POST /cases/{case_id}/review` and `GET /cases/{case_id}/trace`.

**Acceptance criteria:** edits persist in effective state and audit; rejection never executes; approval creates exactly one mock incident even when repeated; trace records review and execution outcome.

**Required documentation updates:** `README.md` implemented endpoint surface; `docs/architecture.md` approval and idempotency details; `docs/demo.md` full review/approve/reject path; this roadmap completion record.

Completed: 2026-08-12
Scope: Added typed review edits and decisions, persisted approvals in workflow state, action-idempotent mock incident execution, review/execution audit events, and review/trace API endpoints.
Verification: In a clean Docker PostgreSQL database, `uv run alembic upgrade head` applied revisions through `20260812_04`; `uv run pytest -q` passed (16 tests); `uv run ruff check .` passed; `uv run mypy app` passed.
Documentation: Updated `README.md`, `docs/architecture.md`, `docs/demo.md`, `PROJECT_CONTEXT.md`, and this roadmap.
Follow-up: Harden acceptance paths, Docker workflow, CI, and API documentation in phase 8.

### 8. Acceptance hardening and API delivery — completed

**Dependencies:** phase 7 completed.

**Deliverables:** complete API, integration, and negative-path test suite; verified Docker workflow; GitHub Actions; executable API demo instructions; final API documentation audit.

**Acceptance criteria:** all documented MVP acceptance tests pass; Compose starts a clean demo environment; CI runs the relevant checks; the API demo can be followed through `/docs` without credentials; documentation has no stale planned/implemented claims.

**Required documentation updates:** `README.md`, `docs/architecture.md`, `docs/demo.md`, and this roadmap completion record.

Completed: 2026-08-12
Scope: Added GitHub Actions CI with PostgreSQL-backed integration tests, Compose health checks, Docker build hygiene, negative API coverage, and an executable no-credential local API demo.
Verification: `docker compose up --build` passed health, intake, approval, and trace smoke checks without LLM credentials (9 trace events); `uv run pytest -q` passed (11 tests, 6 PostgreSQL tests skipped without `TEST_DATABASE_URL`); `uv run ruff check .`, `uv run mypy app`, `docker compose config --quiet`, and `git diff --check` passed.
Documentation: Updated `README.md`, `docs/architecture.md`, `docs/demo.md`, `PROJECT_CONTEXT.md`, and this roadmap.
Follow-up: Phase 9 may add the deferred reviewer frontend; the API MVP is ready for local demonstration without provider credentials.

### 9. Reviewer frontend and Vercel Hobby deployment — in progress

**Dependencies:** phase 8 completed.

**Deliverables:** a thin reviewer UI for case intake, case state, trace inspection, edits, approval, and rejection; a static/frontend deployment configuration for Vercel Hobby; documented API base-URL configuration and deployment steps.

**Acceptance criteria:** the deployed frontend can use the documented API without exposing provider or database credentials; it supports the API MVP demo flow; build succeeds on Vercel Hobby; its expected usage remains within the current Hobby plan's non-commercial, personal-use terms and service limits.

**Required documentation updates:** `README.md` frontend setup/deployment; `docs/architecture.md` browser/API trust boundary and CORS policy; `docs/demo.md` reviewer UI demo; this roadmap completion record.

**Hosting constraints:** Vercel Hobby is free but restricted to non-commercial personal use. Deploy only frontend/static assets there; keep FastAPI, PostgreSQL, LLM keys, and all write-policy enforcement outside the browser and outside Vercel client bundles. Re-check current Vercel limits and terms before deploying because they can change.

**Detailed implementation plan:** Follow `docs/frontend-plan.md`. Its sequential
subphases are 9.1 foundation, 9.2 visual primitives and shell, 9.3 intake, 9.4
read-only reviewer workspace, 9.5 edits and decision gate, 9.6 trace, 9.7
end-to-end quality, and 9.8 deployment/handoff. Complete and verify each
subphase before starting the next one.

During subphase 9.2, use the mapped [Beautiful UI](https://www.beautifului.dev/)
patterns for loading, workflow status, recommendations, evidence context,
human approval, and trace filtering. Follow the adaptation and exclusion rules
in `docs/frontend-plan.md`; the reference must not turn the reviewer workspace
into a chat interface or expose hidden model reasoning.

**Interface principle:** the UI must foreground the Request → Evidence → Brief
→ Human gate → Audit workflow. It must not present the product as a generic
chatbot or hide facts, inferences, missing information, action state, or trace.

Completed: 2026-08-13
Scope: Subphase 9.1 — React/TypeScript/Vite frontend scaffold, typed fetch wrapper, `VITE_API_BASE_URL` validation, CI frontend jobs, CORS allowlist, and machine-readable 404 error envelopes.
Verification: `uv run pytest tests/test_http_errors.py tests/test_health.py -q` passed; `uv run ruff check app tests` passed; `uv run mypy app` passed; `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` with `VITE_API_BASE_URL=http://127.0.0.1:8000` passed in `frontend/`; production build without `VITE_API_BASE_URL` failed with the required configuration error.
Documentation: Updated `README.md`, `PROJECT_CONTEXT.md`, `docs/architecture.md`, `docs/frontend-plan.md`, `.env.example`, and this roadmap.
Follow-up: Continue with subphase 9.2 (tokens, primitives, application shell). Do not mark phase 9 complete until 9.8.

Completed: 2026-08-13
Scope: Subphase 9.2 — design tokens, UI primitives, Beautiful UI pattern adaptations, application shell, error boundary, and `/dev/components` gallery.
Verification: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` with `VITE_API_BASE_URL=http://127.0.0.1:8000` passed in `frontend/`.
Documentation: Updated `docs/frontend-plan.md`, `docs/frontend-patterns.md`, `docs/architecture.md`, `PROJECT_CONTEXT.md`, `README.md`, and this roadmap.
Follow-up: Continue with subphase 9.3 (product entry and intake). Do not mark phase 9 complete until 9.8.

## MVP boundaries

The roadmap does not authorize authentication, real ticketing or other production integrations, autonomous writes, a vector database, or real customer data. The thin reviewer frontend is deferred to phase 9, after the API MVP is complete; it does not broaden the product boundary.
