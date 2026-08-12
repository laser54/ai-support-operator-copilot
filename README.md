# AI Support Operator Copilot

> A traceable AI workflow for turning support requests into human-reviewed actions.

AI Support Operator Copilot accepts an unstructured support request, gathers evidence from bounded tools, produces a reviewable resolution brief, and pauses before any external action. A human can correct the analysis, edit the customer-facing reply, approve or reject an action, and inspect the full audit trail.

This is an API-first portfolio project. The initial release deliberately avoids a large frontend: FastAPI/OpenAPI and deterministic fixtures make the workflow inspectable and testable before a reviewer UI is added.

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

See [docs/product.md](docs/product.md) for scenarios and acceptance criteria, [docs/architecture.md](docs/architecture.md) for the technical design, and [docs/demo.md](docs/demo.md) for the demonstrable path.

## Planned API surface

- `POST /cases` — create a case and execute intake through the review gate.
- `GET /cases/{case_id}` — retrieve case state, brief, evidence and audit events.
- `POST /cases/{case_id}/review` — submit an operator correction, edited reply, or approval decision.
- `GET /cases/{case_id}/trace` — inspect ordered graph/tool/review events.

## Technology direction

- Python 3.12, FastAPI, Pydantic v2
- PostgreSQL for cases, reviews, audit events and durable workflow state
- LangGraph for explicit orchestration and pause/resume
- fixture-backed tools for an offline, repeatable demo
- pytest, Docker Compose and GitHub Actions

No credentials or production integrations are required for the first vertical slice.

## Status

**Scaffolded.** The repository currently defines the product and delivery contract. Implementation starts with a test-first vertical slice: `POST /cases` creates an incident case, retrieves fixture evidence, produces an action proposal, and stops at `awaiting_human_review` without executing it.

## Related work

- `support_operator_panel` — earlier FastAPI/React operator workspace.
- `assist-craft-qna` — earlier semantic retrieval and reranking component.

This repository is a separate project. It reuses the product insight of those systems but does not claim to be a production successor or a fork of either one.

## License

Private repository. License and publication decision are intentionally deferred.
