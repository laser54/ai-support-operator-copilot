# Reviewer frontend product and implementation plan

## Purpose

The reviewer frontend turns the API MVP into a clear operator workspace. Its
main product advantage is not chat-style text generation; it is a visible,
controlled path from an incomplete request to evidence, a proposed action, a
human decision, and an auditable result.

This document is the authoritative interface plan for roadmap phase 9. All
features described here are planned unless explicitly marked as already
available in the backend.

## Experience goals

The interface must make five ideas obvious within the first minute:

1. AI analysis is structured rather than hidden in a chat transcript.
2. Every recommendation is linked to evidence with stable source IDs.
3. Missing information and uncertainty are visible, not disguised.
4. A consequential action is blocked until a human reviews it.
5. The complete workflow is available as an ordered audit trace.

The primary success measure for the first frontend is task clarity: a reviewer
can create the canonical case, understand why it is P1, inspect all three
evidence sources, edit the effective answer, approve or reject the proposal,
and verify the outcome without opening raw JSON.

## Product boundaries

### Included in the first frontend

- create a case from free text;
- display persisted case state and current workflow stage;
- inspect triage, facts, inferences, missing information, and evidence;
- edit priority, reply draft, and requester facts;
- approve or reject the proposed incident action;
- display execution result and exactly-once mock incident reference;
- inspect the ordered audit trace;
- recover cleanly from validation, network, empty, and stale-data states;
- responsive desktop and tablet layouts, with a usable mobile read/review flow.

### Explicitly excluded

- authentication, roles, teams, inbox assignment, and multi-tenancy;
- real ticketing, CRM, messaging, or production status integrations;
- autonomous send or execute controls;
- chat history, agent avatars, or a generic conversational UI;
- analytics dashboards, SLA charts, bulk actions, and notification centers;
- storing LLM or database credentials in the browser;
- a frontend proxy that weakens backend policy enforcement.

These exclusions prevent the portfolio UI from implying production readiness
or becoming a helpdesk product before the core reviewer workflow is proven.

## Recommended technical shape

Use a small static single-page application:

- React with TypeScript and Vite;
- React Router for `/`, `/cases/new`, and `/cases/:caseId` routes;
- TanStack Query for API server state, mutations, retries, and cache invalidation;
- React Hook Form with schema validation for intake and review forms;
- CSS variables plus CSS Modules, or one lightweight utility layer, for tokens
  and component styling;
- Lucide or another single consistent outline icon set;
- Vitest and Testing Library for component and interaction tests;
- Playwright for the canonical create/review/trace browser journey.

Do not add Redux, a meta-framework, server rendering, WebSockets, a component
marketplace, or a large design-system dependency for the first slice. The
frontend owns presentation and temporary form state; FastAPI remains the source
of truth for cases, approvals, execution, and trace order.

### Beautiful UI reference patterns

[Beautiful UI](https://www.beautifului.dev/) is the preferred interaction and
visual reference for AI-native components that overlap this product. It is a
reference, not a required runtime dependency or a license to copy code. Before
reusing implementation code or assets, verify their current license and terms.
Rebuild the selected patterns with this project's tokens, semantics, API data,
and accessibility requirements.

Use or adapt these catalog patterns when implementing the corresponding UI:

| Beautiful UI pattern | Project use | Required adaptation |
| --- | --- | --- |
| Loading State | Case intake analysis and independent trace loading | Show only stages and elapsed state supported by the API. Use a section-shaped skeleton for initial case loading, stop motion when the request settles, and provide an accessible text status. |
| Task Rows | Workflow rail and compact trace progress summary | Map rows to the real Request, Evidence, Brief, Human review, Outcome, and audit events. Preserve backend order and use text plus icons for running, completed, failed, and waiting states. |
| Approval Card | Human review gate and explicit approve/reject confirmation | Keep approve and reject equally understandable, show the exact proposed action and consequences, require an explicit decision, and keep keyboard focus behavior compliant. Never execute from a purely client-side state change. |
| Recommendation Card | Proposed action card | Use the clear hierarchy, alternatives, and primary action layout. Replace any generic confidence meter with evidence strength, policy result, and uncertainty text derived from the API; confidence must never imply authorization. |
| Context Cards | Evidence and source cards | Show source type, fixture label, retrieval reason, relevant excerpt, and stable source ID. Keep facts visually distinct from inferences and missing information. |
| Filter Table | Audit trace filters | Adapt status chips into event-category filters with visible counts. Filtering must not reorder, merge, or mutate the authoritative trace. |
| Records Table | A future case list only if the bounded case-list API is added | Use responsive rows, sortable columns, and explicit status labels. Do not add this pattern to the first single-case slice or persist a browser-only case index. |
| Search | A future case or audit search only when the backend supports it | Provide keyboard navigation, a clear empty state, and server-backed results. Do not ship a decorative command palette with no authoritative data source. |
| Sidebar Nav | Workspace navigation only after the product has multiple durable top-level destinations | Retain its compact hierarchy and quick-action clarity, but use the workflow rail for the first MVP instead of introducing an unnecessary permanent sidebar. |
| Streaming Text | Provider output only if a future API exposes real streaming | Preserve inline sources and completion actions, announce updates without overwhelming screen readers, and provide a stable completed view. Do not simulate streaming for the current synchronous API. |

The following catalog patterns are intentionally not part of the first slice:

- **Thinking** must not expose hidden chain-of-thought. If diagnostic progress is
  later needed, show concise, backend-provided stage summaries or tool results;
- **Chat** and **Prompt Bar** must not become the primary shell because this is a
  structured evidence-and-review workspace, not a generic chatbot;
- **Tool Chips** may be reconsidered for trace summaries, but only when each chip
  maps to an actual auditable tool event rather than decorative agent activity;
- **Diff Table** is useful only after the API exposes structured before/after
  edits; the current editable brief should use normal form fields and review;
- **Insight Cards**, **Fine-tune Card**, and **Selection Actions** do not match the
  MVP workflow and should not be introduced as ornamental features.

Borrow Beautiful UI's strongest visual qualities: restrained dark or light
surfaces, compact hierarchy, subtle borders, clearly grouped actions, readable
status labels, and generous space around the active decision. Do not copy its
demo content, dark theme values, density, animation, or component geometry
verbatim. The project token system, WCAG 2.2 AA requirements, responsive rules,
and security boundary in this document take precedence.

### Proposed repository layout

```text
frontend/
  src/
    app/                 router, providers, application shell
    api/                 typed client, transport errors, query keys
    components/          reusable UI primitives and workflow components
    features/
      intake/            new-case form and example request
      case-review/       case workspace and editable brief
      trace/             audit timeline and filters
    pages/               route-level composition
    styles/              tokens, reset, global layout
    test/                fixtures and browser-test helpers
  public/
  index.html
  package.json
  vite.config.ts
  vercel.json
```

## Information architecture

### Route 1: `/` — product entry

This is a compact orientation page, not a marketing landing page. It contains:

- product name and one-line value statement;
- a horizontal workflow strip: Request → Evidence → Brief → Human gate → Audit;
- a prominent “Create demo case” action;
- three trust statements: fixture-backed evidence, human approval required,
  and traceable decisions;
- a secondary link to API documentation for technical reviewers.

The workflow strip should be the visual signature of the product. It explains
the system faster than a hero illustration or chat mockup.

### Route 2: `/cases/new` — intake

The page contains one focused input card:

- clear label “Describe the support issue”;
- multiline text area with remaining-character guidance;
- “Use demo request” control that inserts the canonical login HTTP 500 text;
- submit button labelled “Analyze request”;
- adjacent privacy note: synthetic/local data only for the demo;
- short explanation of what happens next and that no action will execute.

On submit, disable duplicate submission, show the real workflow stages, and
navigate to `/cases/{caseId}` after the API returns. Do not simulate streaming
steps that the backend does not expose.

### Route 3: `/cases/:caseId` — reviewer workspace

Desktop uses a 12-column layout with three functional regions:

```text
+-----------------------------------------------------------------------+
| Case header: status, priority, risk, provider mode, copy case ID       |
+--------------------------+--------------------------------------------+
| Workflow rail            | Review workspace                           |
| Request                   | Triage and requester facts                 |
| Evidence                  | Evidence cards / missing information       |
| Brief                     | Editable reply and proposed action         |
| Human review              | Review decision controls                   |
| Outcome                   |                                            |
+--------------------------+--------------------------------------------+
| Collapsible audit timeline with event details                         |
+-----------------------------------------------------------------------+
```

The left rail is navigation and progress, not a decorative stepper. Selecting
a step scrolls or focuses its corresponding section. The central workspace is
the current review task. The trace remains collapsed by default but shows its
event count and latest event.

On tablets, the rail becomes a horizontal scrollable stepper. On small screens,
sections form one vertical sequence and the review action bar becomes sticky at
the bottom without covering focused controls.

## Detailed screen decisions

### Case header

Show:

- short case ID with a copy action;
- status badge using text plus color;
- priority and risk badges;
- “Offline deterministic” or “Provider-backed” provenance badge;
- refresh action and last successful fetch time.

Status language must be human-readable: “Waiting for review”, “Completed”, or
“Rejected”. Raw enum values may appear only in technical details.

### Request and triage section

Place the original request in a visually distinct quotation panel. Beside or
below it, show category, priority, risk, and confidence. Confidence should be a
labelled percentage or meter with text; never use an unlabeled circular gauge.

Priority becomes editable only after the reviewer selects “Edit analysis”. The
original value remains available through an “AI suggested P1” annotation so the
human correction is understandable.

### Facts, inferences, and missing information

Keep these as three separate semantic groups:

- “Reported facts” uses neutral cards;
- “System inferences” uses an AI/provenance marker and confidence context;
- “Still needed” uses an amber checklist, not an error style.

This separation is one of the product's strongest differentiators and must not
be flattened into one summary paragraph.

### Evidence section

Each evidence card shows:

- source type icon and label;
- stable source ID in monospace text with copy action;
- concise excerpt;
- tool name and observed timestamp;
- an explicit “Synthetic fixture” badge.

Default order follows workflow/tool order: knowledge, similar case, service
status. Cards can expand for metadata, but the source ID and excerpt remain
visible without expansion. Do not show fake external links when `source_url` is
absent.

### Resolution brief

Display the reply draft in a readable preview first. “Edit reply” switches to a
textarea while preserving cancel/reset controls. Show character count and mark
unsaved local edits. The reviewer must see which values will be submitted before
making a decision.

### Proposed action and policy gate

The proposed incident action is the focal decision card. It shows:

- action type and payload preview;
- risk and “Approval required” badge;
- current action state;
- a policy message: “This action cannot run until you approve it.”

Use two decision controls:

- primary “Approve and create mock incident”;
- secondary destructive-outline “Reject proposal”.

Approval opens a confirmation dialog summarizing effective edits, action, and
mock-only side effect. Rejection opens a smaller dialog with an optional reason.
Neither dialog closes on backdrop click while a request is in flight. Prevent
double submission and keep the operation idempotent from the user's perspective.

### Outcome state

After approval, replace decision controls with a success panel containing the
`MOCK-...` reference, execution timestamp, and “View in trace” action. Repeated
approval must not be presented as a new operation. After rejection, show a calm
final state explaining that no incident was created.

### Audit trace

Render events as a vertical timeline with sequence number, event type, actor,
timestamp, and node/tool name. Event details expose safe input/output summaries
and correlation ID. Offer simple filters for All, Workflow, Tools, Human, and
Execution; filters operate only on already loaded events.

Use meaningful event labels:

- Case created;
- Knowledge searched;
- Similar cases checked;
- Service status checked;
- Brief built;
- Human review requested;
- Review recorded;
- Action approved/rejected;
- Mock incident executed.

The timeline must preserve backend sequence order and must never infer or merge
events in a way that changes the audit record.

## Visual direction

The visual language should feel like a modern operations console: calm, precise,
and trustworthy rather than futuristic or playful.

### Color system

- canvas: warm near-white or very dark graphite, with a user-selectable theme
  only if both themes can be completed consistently;
- primary: deep indigo or cobalt for navigation and primary actions;
- evidence: cyan/teal accent;
- human review: violet accent to distinguish human authority from AI output;
- success: green, warning/missing information: amber, rejection: red;
- neutral text and borders carry most of the interface to avoid “rainbow status”.

Color never carries meaning alone. Every state also uses text, icon, or shape.

### Typography and density

- use a clean variable sans-serif for interface text and a monospace face only
  for source IDs, case IDs, and correlation IDs;
- use a compact but breathable 4/8px spacing system;
- keep body text at 16px on primary reading surfaces;
- target a maximum readable text width around 70–80 characters;
- use medium-radius cards and subtle borders; reserve shadows for overlays and
  the active decision card.

Avoid glassmorphism, animated gradients, oversized hero text, dense data tables,
and chatbot bubbles. They obscure the evidence-and-review workflow.

### Motion

Use motion only for state continuity: section reveal, status transition, dialog,
and timeline expansion. Keep transitions around 150–220ms and respect
`prefers-reduced-motion`. Never animate progress indefinitely after the server
has already completed the synchronous request.

## Interaction and state model

### Server state

Use stable query keys:

```text
['case', caseId]
['case-trace', caseId]
```

After a review mutation succeeds, replace or invalidate the case query and
invalidate the trace query. Do not optimistically show an execution result:
approval outcome must come from the backend.

### Local state

Keep only temporary form values, expanded panels, active trace filter, and
dialog state locally. Do not duplicate the entire case response into a global
client store.

### Loading and error behavior

- intake submission: show named workflow stages and a cancel-navigation warning;
- case loading: use section-shaped skeletons, not a blank spinner page;
- trace loading: keep the case review usable and show an independent trace state;
- validation errors: place messages next to fields and focus the first error;
- API unavailable: show retry plus the configured API base URL;
- 404: show “Case not found” with a route back to new intake;
- stale mutation: refetch the case and ask the reviewer to confirm again;
- provider fallback: show an informational provenance badge, not an alarm.

## Accessibility and responsive requirements

Target WCAG 2.2 AA for the implemented frontend:

- minimum text contrast of 4.5:1 and non-text control contrast of 3:1;
- visible keyboard focus with at least a clear 2px outline;
- logical heading order, landmarks, form labels, and error associations;
- keyboard access to workflow navigation, dialogs, editing, decisions, and trace;
- minimum 44px preferred interactive targets for primary controls;
- no status communicated only by color;
- dialogs trap focus, restore focus on close, and expose accessible names;
- live regions announce case creation, review completion, and errors;
- content remains usable at 200% text zoom and at 320px CSS width;
- reduced-motion mode disables nonessential transitions.

## API and backend prerequisites

The current backend already supports the full single-case flow:

- `POST /cases`;
- `GET /cases/{case_id}`;
- `POST /cases/{case_id}/review`;
- `GET /cases/{case_id}/trace`.

Before browser integration, add only these backend changes:

1. configurable CORS allowlist for local Vite and the deployed frontend origin;
2. a documented `VITE_API_BASE_URL` frontend environment variable;
3. consistent machine-readable error envelopes for expected 404/409 failures;
4. OpenAPI-generated or manually verified TypeScript response types.

A case-list endpoint is not required for the first demo. If navigation across
previous cases becomes necessary, add a bounded `GET /cases?limit=&cursor=` API
as a separate backend change; do not invent browser-only local persistence as a
substitute for the server source of truth.

## Security and deployment boundary

- the browser receives only `VITE_API_BASE_URL`; it never receives database or
  LLM credentials;
- all approval and exactly-once enforcement remains in FastAPI/PostgreSQL;
- Vercel hosts static frontend assets only;
- the backend must not be exposed publicly before authentication and an explicit
  deployment threat model exist;
- local/demo use may point the frontend at localhost or a separately protected
  backend;
- Vercel Hobby deployment is suitable only for personal, non-commercial use and
  its current terms/limits must be rechecked at deployment time.

## Step-by-step implementation plan

### Step 9.1 — Frontend foundation

Status: implemented.

Deliver:

- scaffold `frontend/` with React, TypeScript, and Vite;
- add routing, query provider, environment validation, linting, formatting, and
  test scripts;
- define API base URL and a typed fetch wrapper;
- add frontend build/test jobs to CI.

Acceptance:

- `npm run build`, type check, lint, and unit tests pass;
- invalid or absent `VITE_API_BASE_URL` produces a clear startup/build error;
- no secret variables are referenced by client code.

### Step 9.2 — Tokens, primitives, and application shell

Status: implemented.

Deliver:

- color, type, spacing, radius, elevation, and focus tokens;
- Button, Badge, Card, TextField, TextArea, Dialog, Callout, Skeleton, and
  visually-hidden primitives;
- implement the relevant Beautiful UI reference patterns through local
  primitives: Loading State, Task Rows, Approval Card, Recommendation Card,
  Context Cards, and Filter Table;
- responsive header, content container, and error boundary;
- Storybook is optional and should be added only if component development needs
  it; a dedicated `/dev/components` route is sufficient for the MVP.

Acceptance:

- primitives cover keyboard, hover, focus, disabled, loading, and error states;
- contrast and zoom checks pass for the chosen theme;
- no page-specific hard-coded status colors bypass tokens;
- every adopted Beautiful UI pattern satisfies the adaptation rules above and
  has a documented keyboard, screen-reader, reduced-motion, and narrow-screen
  state in [frontend-patterns.md](frontend-patterns.md).

### Step 9.3 — Product entry and intake

Status: implemented.

Deliver:

- workflow-oriented product entry page;
- new-case form with demo-request insertion;
- create mutation, validation, duplicate-submit protection, and navigation;
- real loading state reflecting the synchronous API call.

Acceptance:

- the canonical request creates a case and routes to its workspace;
- invalid input is announced and focused;
- a failed API call preserves the user's text and provides retry.

### Step 9.4 — Read-only reviewer workspace

Deliver:

- case header and workflow rail;
- request, triage, facts, inferences, missing-information, evidence, brief, and
  proposed-action sections;
- provider/fallback provenance and fixture labels;
- responsive desktop/tablet/mobile composition.

Acceptance:

- all API fields needed to explain the recommendation are visible;
- stable evidence source IDs can be copied;
- `awaiting_human_review`, `completed`, and `rejected` states render distinctly;
- reloading `/cases/{id}` restores the workspace from server state.

### Step 9.5 — Human edits and decision gate

Deliver:

- editable priority, reply, and requester facts;
- dirty-state indication and reset/cancel behavior;
- approve and reject confirmations with effective-value summaries;
- mutation handling, disabled duplicate submission, and final outcome panels.

Acceptance:

- edits persist after refresh;
- approval displays exactly one mock reference even if retried;
- rejection never shows execution success;
- the UI cannot bypass the backend policy gate.

### Step 9.6 — Audit trace experience

Deliver:

- ordered timeline, event groups, filters, detail disclosure, and correlation IDs;
- links from evidence, policy gate, and execution result to relevant events;
- independent loading/error state and refresh.

Acceptance:

- sequence order matches the API exactly;
- tool events show source IDs and human events show actor/decision;
- execution appears only after approval and never after rejection;
- keyboard and screen-reader navigation is understandable.

### Step 9.7 — End-to-end quality and polish

Deliver:

- Vitest/Testing Library coverage for components and mutations;
- Playwright coverage for create, inspect, edit/approve, repeat approve, reject,
  refresh, API failure, and 404;
- responsive snapshots at mobile, tablet, and desktop breakpoints;
- accessibility scan plus manual keyboard/focus review;
- polished empty, loading, fallback, success, and error copy.

Acceptance:

- the canonical demo completes without Swagger or raw JSON;
- no critical automated accessibility findings remain;
- repeated approval produces one mock incident in UI and trace;
- production build contains no credential-like strings.

### Step 9.8 — Static deployment and handoff

Deliver:

- Vercel SPA rewrite configuration and build settings;
- documented `VITE_API_BASE_URL` configuration;
- CORS allowlist configuration for the selected frontend origin;
- preview-deployment smoke checklist;
- README screenshots or a short workflow recording after visual QA.

Acceptance:

- direct navigation to `/cases/{id}` serves the SPA;
- frontend deployment exposes no secrets;
- the deployed frontend can reach only the explicitly configured API;
- Vercel plan use is confirmed as personal/non-commercial or moved to an
  appropriate paid plan;
- backend deployment/security remains a separately approved task.

## Testing matrix

| Area | Required checks |
|---|---|
| Intake | empty, maximum length, demo insertion, network retry, duplicate submit |
| Case load | success, 404, malformed response, refresh, offline fallback badge |
| Review | edits, cancel, approve, repeat approve, reject, server conflict |
| Evidence | three source types, source IDs, missing URL, long excerpt |
| Trace | sequence order, filters, details, execution absent/present |
| Responsive | 320px, 768px, 1280px+, zoom to 200% |
| Accessibility | keyboard path, focus restore, labels, live messages, contrast |
| Security | no secrets in bundle, CORS allowlist, no client-side authorization |

## Definition of done

The frontend phase is complete only when a reviewer can open the deployed or
local UI, create the canonical case, understand its facts/evidence/inferences,
edit the effective result, approve or reject, inspect the exact trace, and
verify the action boundary without using Swagger. The experience must remain
honest about synthetic fixtures, mock execution, offline fallback, absent auth,
and non-production status.

## External implementation references

- [Beautiful UI](https://www.beautifului.dev/) — interaction and visual
  reference for the explicitly mapped AI-native patterns; verify licensing
  before reusing implementation code or assets.

- [Vite React/TypeScript setup](https://vite.dev/guide/)
- [TanStack Query for React](https://tanstack.com/query/latest/docs/framework/react/overview)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)

These references are implementation guidance, not repository dependencies. Pin
actual package versions in the frontend lockfile when step 9.1 begins, and
recheck hosting terms immediately before step 9.8.
