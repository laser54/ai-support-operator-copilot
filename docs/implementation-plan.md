# MVP implementation roadmap

## Purpose and current status

This document is the authoritative sequential implementation guide for the repository. The product, architecture, and demo documents define the intended behavior; this roadmap records what has actually been implemented and what must happen next.

**Current milestone:** MVP vertical slice

**Current phase:** 2 — PostgreSQL foundation
**Overall status:** in progress

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

### 2. PostgreSQL foundation — not started

**Dependencies:** phase 1 completed.

**Deliverables:** Docker Compose for PostgreSQL and API; SQLAlchemy repository foundation; Alembic baseline migration; database lifecycle; integration-test database configuration.

**Acceptance criteria:** migrations apply to a clean PostgreSQL instance; repository smoke tests persist and reload data; integration tests use an isolated database.

**Required documentation updates:** `README.md` database, Compose, and migration commands; `docs/architecture.md` persistence implementation; this roadmap completion record.

### 3. Domain contracts and fixtures — not started

**Dependencies:** phase 2 completed.

**Deliverables:** typed case, triage, evidence, resolution brief, proposed action, review, audit-event, and execution-result contracts; deterministic synthetic knowledge, similar-case, and service-status fixtures.

**Acceptance criteria:** contracts validate valid and invalid payloads; fixtures have stable source IDs and support the login HTTP 500 after update scenario; no fixture contains real customer data.

**Required documentation updates:** `docs/architecture.md` contract details; `docs/product.md` only if externally visible behavior differs; this roadmap completion record.

### 4. Read-only tools and audit trail — not started

**Dependencies:** phase 3 completed.

**Deliverables:** fixture-backed knowledge, similar-case, and service-status tools; persisted, ordered audit events for case lifecycle and every tool call.

**Acceptance criteria:** each read-only tool returns traceable evidence; tool calls have stable event ordering and safe input/output summaries; audit events persist and reload with the case.

**Required documentation updates:** `docs/architecture.md` tools and audit semantics; `docs/demo.md` trace expectations; this roadmap completion record.

### 5. Triage and brief generation — not started

**Dependencies:** phase 4 completed.

**Deliverables:** OpenAI-compatible structured LLM adapter; Pydantic boundary validation; deterministic offline fallback; missing-information handling; safe recording of provider errors without secrets.

**Acceptance criteria:** configured endpoint yields validated typed output; missing credentials, invalid structured output, and provider failures select the deterministic fallback; no model output can grant write permission.

**Required documentation updates:** `README.md` LLM configuration and fallback; `docs/architecture.md` model boundary and failure behavior; this roadmap completion record.

### 6. LangGraph workflow and intake API — not started

**Dependencies:** phase 5 completed.

**Deliverables:** persisted LangGraph state/checkpoints; intake, triage, evidence, brief, and policy-gate nodes; `POST /cases` and `GET /cases/{case_id}`.

**Acceptance criteria:** the canonical login-500 request creates an incident case with typed triage, three evidence sources, a proposed action, and `awaiting_human_review`; action execution remains impossible at the gate.

**Required documentation updates:** `README.md` implemented endpoint surface; `docs/architecture.md` workflow/data flow; `docs/demo.md` create-and-inspect steps; this roadmap completion record.

### 7. Human review and mock execution — not started

**Dependencies:** phase 6 completed.

**Deliverables:** review edit/approve/reject flow; persisted approval; atomic exactly-once mock incident execution; finalization; `POST /cases/{case_id}/review` and `GET /cases/{case_id}/trace`.

**Acceptance criteria:** edits persist in effective state and audit; rejection never executes; approval creates exactly one mock incident even when repeated; trace records review and execution outcome.

**Required documentation updates:** `README.md` implemented endpoint surface; `docs/architecture.md` approval and idempotency details; `docs/demo.md` full review/approve/reject path; this roadmap completion record.

### 8. Acceptance hardening and API delivery — not started

**Dependencies:** phase 7 completed.

**Deliverables:** complete API, integration, and negative-path test suite; verified Docker workflow; GitHub Actions; executable API demo instructions; final API documentation audit.

**Acceptance criteria:** all documented MVP acceptance tests pass; Compose starts a clean demo environment; CI runs the relevant checks; the API demo can be followed through `/docs` without credentials; documentation has no stale planned/implemented claims.

**Required documentation updates:** `README.md`, `docs/architecture.md`, `docs/demo.md`, and this roadmap completion record.

### 9. Reviewer frontend and Vercel Hobby deployment — not started

**Dependencies:** phase 8 completed.

**Deliverables:** a thin reviewer UI for case intake, case state, trace inspection, edits, approval, and rejection; a static/frontend deployment configuration for Vercel Hobby; documented API base-URL configuration and deployment steps.

**Acceptance criteria:** the deployed frontend can use the documented API without exposing provider or database credentials; it supports the API MVP demo flow; build succeeds on Vercel Hobby; its expected usage remains within the current Hobby plan's non-commercial, personal-use terms and service limits.

**Required documentation updates:** `README.md` frontend setup/deployment; `docs/architecture.md` browser/API trust boundary and CORS policy; `docs/demo.md` reviewer UI demo; this roadmap completion record.

**Hosting constraints:** Vercel Hobby is free but restricted to non-commercial personal use. Deploy only frontend/static assets there; keep FastAPI, PostgreSQL, LLM keys, and all write-policy enforcement outside the browser and outside Vercel client bundles. Re-check current Vercel limits and terms before deploying because they can change.

## Completion records

No implementation phase has been completed yet.

## MVP boundaries

The roadmap does not authorize authentication, real ticketing or other production integrations, autonomous writes, a vector database, or real customer data. The thin reviewer frontend is deferred to phase 9, after the API MVP is complete; it does not broaden the product boundary.
