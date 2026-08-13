# AI Support Operator Copilot

> A traceable AI workflow for turning support requests into human-reviewed actions.

AI Support Operator Copilot accepts an unstructured support request, gathers evidence from bounded tools, produces a reviewable resolution brief, and pauses before any external action. A human can correct the analysis, edit the customer-facing reply, approve or reject an action, and inspect the full audit trail.

This is an API-first portfolio project. The initial release deliberately avoids a large frontend: FastAPI/OpenAPI and deterministic fixtures make the workflow inspectable and testable before a reviewer UI is added.

A thin reviewer frontend is in progress (phase 9). It will be deployed as a
personal, non-commercial frontend on Vercel Hobby; the FastAPI backend,
PostgreSQL, policy gate, and all secrets remain outside the browser.

## Problem

A support request often arrives incomplete: it may mix symptoms, urgency, user impact and assumptions. An operator must look up knowledge-base articles, similar incidents and service status, then decide what should happen next. A generic chat bot can draft plausible text, but it is hard to verify why it made a recommendation and unsafe to let it execute actions invisibly.

## Product boundary

The copilot may:

- extract structured facts, uncertainty and risk from a request;
- query read-only knowledge, similar-case and service-status tools;
- propose a customer-facing reply and a resolution plan with linked evidence;
- create a draft external action;
- resume after a human edits or approves the case.

The copilot must not:

- silently create tickets, send messages, or change external systems;
- treat retrieved documents as executable instructions;
- present unsupported claims as facts;
- replace the operator's approval for consequential actions.

## Primary workflow

```text
request
  -> intake and structured triage
  -> evidence gathering (knowledge base, similar cases, service status)
  -> resolution brief and proposed action
  -> policy gate
  -> human review / edit / approve / reject
  -> approved mock action or final reply
  -> immutable audit trail
```

See [docs/product.md](docs/product.md) for scenarios and acceptance criteria,
[docs/architecture.md](docs/architecture.md) for the technical design,
[docs/demo.md](docs/demo.md) for the demonstrable API path, and
[docs/frontend-plan.md](docs/frontend-plan.md) for the reviewer UI.
The authoritative sequential implementation guide and completion evidence are
maintained in [docs/implementation-plan.md](docs/implementation-plan.md).

## API surface

- `POST /cases` — create a case and execute intake through the review gate.
- `GET /cases/{case_id}` — retrieve case state, original request, brief, evidence and audit events.
- `POST /cases/{case_id}/review` — submit an operator correction, edited reply, or approval decision.
- `GET /cases/{case_id}/trace` — inspect ordered graph/tool/review events.

## Technology direction

- Python 3.12, FastAPI, Pydantic v2
- PostgreSQL for cases, reviews, audit events and durable workflow state
- LangGraph for explicit orchestration and pause/resume
- fixture-backed tools for an offline, repeatable demo
- pytest, Docker Compose and GitHub Actions
- React, TypeScript, and Vite for the reviewer frontend (`frontend/`)

No credentials or production integrations are required for the first vertical slice.

## Local setup

The project uses [uv](https://docs.astral.sh/uv/) and Python 3.12.

```powershell
uv sync --all-groups
uv run uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the generated API documentation. Copy
`.env.example` to `.env` only when local configuration is needed. LLM variables
are optional: without all three, the application uses its deterministic offline
fallback.

Run the foundation checks with:

```powershell
uv run pytest -q
uv run ruff check .
uv run mypy app
```

## Local Docker demo — no LLM key required

The repository now includes a PostgreSQL persistence foundation. It stores the
minimal durable `cases` record; typed workflow state, reviews, and audit events
are added in later roadmap phases.

Start the complete local stack (PostgreSQL is exposed on port `55432` to avoid
common local PostgreSQL port conflicts):

```powershell
docker compose up --build
```

Wait for `api` to become healthy, then open [API docs](http://127.0.0.1:8000/docs)
or run the full scripted API demo in [docs/demo.md](docs/demo.md). Stop it with
`docker compose down`; add `--volumes` only when you intentionally want a fresh
local database.

For a locally managed PostgreSQL instance, set `DATABASE_URL` and apply the
schema:

```powershell
uv run alembic upgrade head
```

The PostgreSQL repository integration test runs only when `TEST_DATABASE_URL`
is set. It must name a dedicated disposable database because the test truncates
the `cases` table before it runs. A repeatable local command sequence is:

```powershell
docker compose up -d db
# create a separate test database named copilot_test in that container
$env:TEST_DATABASE_URL = "postgresql+psycopg://copilot:copilot@localhost:55432/copilot_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
uv run alembic upgrade head
uv run pytest -q
docker compose down --volumes
```

## LLM configuration and fallback

Triage and resolution-brief generation use a strict OpenAI-compatible JSON
boundary. Set all three optional variables to enable a compatible provider:

```text
LLM_API_KEY=...
LLM_BASE_URL=https://provider.example/v1
LLM_MODEL=provider-model-name
```

Leaving any of these unset selects the deterministic offline fallback. The same
fallback is used when a provider request fails or its response does not match
the typed contract. Provider errors and credentials are not returned in the
result. In every mode, proposed actions are drafts created by application code;
model output cannot execute or authorize a write.

The supplied .env.example is configured for OpenCode Go with DeepSeek V4
Flash:

LLM_BASE_URL=https://opencode.ai/zen/go/v1
LLM_MODEL=deepseek-v4-flash

Set only LLM_API_KEY in your local .env. The provider prompt contains the
exact JSON contract required by the API, uses deterministic sampling
(temperature: 0), and rejects any response that fails Pydantic validation.

## Implemented case API

After applying migrations and starting PostgreSQL, the API now exposes:

- `POST /cases` — accepts `request_text`, runs the explicit workflow through
  intake, evidence gathering, triage, brief generation, and the human policy
  gate; returns `201` with `awaiting_human_review`.
- `GET /cases/{case_id}` — reloads the latest persisted workflow checkpoint.
- `POST /cases/{case_id}/review` — persists operator edits and an approve/reject
  decision; approval creates one mock incident, while rejection never executes.
- `GET /cases/{case_id}/trace` — returns the ordered persisted audit trace.

The canonical login HTTP 500 after update request returns P1 triage, the three
fixture evidence source IDs, and proposed actions. It never executes an action:
the action occurs only after an operator uses the review API.

## Reviewer frontend (local)

The API remains the source of truth. The browser app in `frontend/` is a static
SPA and needs only `VITE_API_BASE_URL`.

```powershell
cd frontend
npm install
npm run dev
```

`frontend/.env.development` points at `http://127.0.0.1:8000`. Start the API
separately. Production builds require `VITE_API_BASE_URL` to be set; an absent
or invalid value fails the build. The frontend never receives `LLM_API_KEY` or
`DATABASE_URL`. Open `/dev/components` for the primitive gallery. Pattern
accessibility states are in [docs/frontend-patterns.md](docs/frontend-patterns.md).

Frontend checks:

```powershell
cd frontend
npm test
npm run lint
npm run typecheck
$env:VITE_API_BASE_URL="http://127.0.0.1:8000"; npm run build
npm run check:bundle
npx playwright install chromium
npm run test:e2e
```

CORS defaults to the local Vite origins. Override with `CORS_ALLOW_ORIGINS` in
the API environment.

## Status

**API MVP implemented.** Frontend subphases 9.1–9.7 are implemented;
Vercel deployment is still planned.

## Related work

- `support_operator_panel` — earlier FastAPI/React operator workspace.
- `assist-craft-qna` — earlier semantic retrieval and reranking component.

This repository is a separate project. It reuses the product insight of those systems but does not claim to be a production successor or a fork of either one.

## License

Private repository. License and publication decision are intentionally deferred.
