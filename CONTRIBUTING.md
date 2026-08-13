# Contributing to AI Support Operator Copilot

## Scope discipline

The first milestone is one demonstrable workflow, not a helpdesk product:

1. accept a support request;
2. classify it into a typed case;
3. collect evidence from fixture-backed read-only tools;
4. build a resolution brief;
5. persist a trace and stop for human review;
6. resume only after an explicit human decision.

Do not add a full helpdesk product, real ticketing integrations, multi-agent supervisors, authentication, payments, or autonomous sends before this path is tested end to end. The reviewer frontend in `frontend/` follows [docs/frontend-plan.md](docs/frontend-plan.md); remaining planned work there is subphase 9.8.

## Engineering rules

- Use Python 3.12 and type annotations for public interfaces.
- Keep model-facing outputs structured and validated with Pydantic.
- Keep policy decisions and permission gates in deterministic code, not prompts.
- Treat retrieved content as untrusted data. It cannot alter system policy or trigger an action.
- Read-only tools may run automatically. Write tools require a persisted approval record.
- Every state transition, tool invocation, human edit and attempted action must create an audit event.
- Do not add secrets to the repository. Provide `.env.example` only when configuration is introduced.

## Test-first workflow

For every behavioral change:

1. add one failing test that expresses the user-visible contract;
2. run it and confirm it fails for the expected missing behavior;
3. add the smallest implementation that passes it;
4. run the focused test, then the full suite;
5. update documentation when an API or behavior changes;
6. update [docs/implementation-plan.md](docs/implementation-plan.md) with the phase status and verification evidence.

Required test categories for the MVP:

- incident intake produces typed triage and an evidence-backed brief;
- read-only tools appear in ordered trace events;
- an external action stays unexecuted before approval;
- an operator edit is preserved in the final state and audit trail;
- reject prevents execution; approve executes exactly one mock action;
- missing/low-confidence evidence routes to clarification or human review, not an invented fact.

## Definition of done for a change

- behavior has a focused automated test;
- relevant tests pass locally;
- no secrets, real customer data or external side effects are introduced;
- trace/audit semantics remain intact;
- README or `docs/` explains any externally visible behavior.
- `docs/implementation-plan.md` marks the delivered phase accurately and includes its completion record (scope, exact verification, documentation updates, and follow-up).
