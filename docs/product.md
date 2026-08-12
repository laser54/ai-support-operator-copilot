# Product definition

## One sentence

AI Support Operator Copilot turns an incomplete support request into an evidence-backed, human-reviewed resolution workflow.

## User and job

The primary user is a support or operations specialist handling an incoming request that has incomplete context, uncertain urgency and possible downstream consequences.

Their job is not merely to answer quickly. They need to decide what is known, what needs checking, which team/process should own the issue, what can be communicated safely, and whether an external action should be created.

## Problem

Typical support handling is fragmented:

- the request is in one inbox;
- procedures are in a knowledge base;
- historical context is in old tickets;
- operational state is in a status page or monitoring system;
- the next action may require another team.

A plain LLM chat can write a fluent answer before it has established enough facts. A standard FAQ search solves only a narrow retrieval problem. The copilot instead gathers evidence, records its reasoning boundary, and hands control to the operator at the action boundary.

## Product promise

For every case, the operator can see:

1. what the requester actually said;
2. what the system inferred, and how confident it is;
3. which tools were invoked and what they returned;
4. which knowledge sources support the proposed resolution;
5. what information is still missing;
6. which action is merely proposed versus actually approved/executed;
7. what the human changed or decided.

## MVP scenario

### Input

> After the update, sales employees cannot sign in to the portal. They see a 500 error. This is urgent.

### Intended output before review

```text
Case type: incident / access
Priority: P1
Risk: high

Known facts:
- failure began after an update (requester report)
- sales team is affected (requester report)
- login path returns HTTP 500 (requester report)

Evidence gathered:
- service-status fixture reports elevated 5xx rates after 10:42
- runbook `auth-5xx-after-release` matches the symptom
- similar incident `INC-104` was routed to Engineering

Missing information:
- first observed timestamp
- affected user/account example
- portal URL/environment

Proposed actions:
- create an Engineering incident draft (approval required)
- ask the requester for missing details (safe proposal)

Suggested reply:
We have recorded the access incident and are checking it with Engineering. Please send the approximate time of the first failure and one affected user or account example.
```

### Human review

The operator may change the priority, add facts, change the reply, reject the proposal, or approve the incident draft. Approval executes exactly one fixture-backed mock action and adds the result to the audit trail.

## Non-goals for the MVP

- A full ticketing/helpdesk platform.
- Autonomous support replies or autonomous writes to real systems.
- Real CRM, status, messaging or ticketing integrations.
- Multi-channel inboxes and authentication/roles.
- Retrieval benchmarking claims or production data.
- A rich web UI.

## Success criteria

The MVP is complete when a fresh local setup can demonstrate and test all of the following:

- a case starts from one free-text request;
- the graph produces typed triage and a resolution brief;
- three fixture-backed read-only tools are called and logged;
- the proposed write action cannot execute before a human approval;
- an operator edit persists and appears in the trace;
- approval executes one mock action; rejection does not;
- the final reply and action decision are visible through the API.

## Future paths, deliberately deferred

- Replace fixture search with an adapter to a semantic retrieval/reranking service.
- Build the thin reviewer UI described in
  [frontend-plan.md](frontend-plan.md), centered on intake, evidence-backed
  review, approval/rejection, and trace visualization.
- Add a real ticketing connector with idempotency and reconciliation.
- Add evaluation datasets for routing, retrieval grounding, clarification and unsafe-action rates.
- Add provider-backed LLM calls behind a reproducible deterministic test mode.
