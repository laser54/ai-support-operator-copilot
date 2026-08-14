# AI Support Operator Copilot

> **An agentic AI workflow with bounded autonomy, multi-source evidence grounding, and deterministic human policy gates.**

<div align="center">

[![LangGraph](https://img.shields.io/badge/LangGraph-StateGraph-FF6F00?style=flat-square&logo=diagram&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063?style=flat-square&logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## 📌 System Context & Architecture

**Evolution & Background.** Building on operational experience with support workflows and knowledge retrieval (such as [Support Operator Panel](https://github.com/laser54/support_operator_panel) and [assist-craft-qna](https://github.com/laser54/assist-craft-qna)), **AI Support Operator Copilot** refactors the operational domain into a modern **agentic, multi-tool orchestration architecture**.

**Problem.** In mission-critical customer support and SRE operations, incoming requests arrive unstructured, incomplete, and urgent. Standard LLM chatbots frequently hallucinate, lack access to live telemetry, and cannot be trusted with autonomous execution in external issue trackers or production systems.

**Solution.** An explicit state machine (LangGraph) ingests unstructured reports, queries three bounded read-only tools (Runbooks, Historical Incidents, Live Service Status), validates structured analytical inferences via Pydantic v2, drafts cautious customer responses and proposed actions, and **strictly suspends execution at a deterministic code-level Policy Gate**. A human operator reviews, corrects, and authorizes any consequential action.

**Architecture & Scope.** Implements stateful LangGraph orchestration, Pydantic v2 structured model boundaries, dual-engine deterministic fallback, PostgreSQL persistence/checkpoints, an immutable audit trail, and a React 19 reviewer UI.

**Verification & Boundary.** Designed with 100% offline repeatability, mock write isolation, idempotent execution, and full auditability without external API dependencies.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Client ["Reviewer Workspace (React 19 / TypeScript / Vite)"]
        UI["Reviewer SPA (http://localhost:5173)"]
        Intake["Case Intake & Demo Scenarios"]
        Workspace["Resolution Brief & Live Edits"]
        GateModal["Human Approval Modal"]
        TraceUI["Ordered Audit Timeline"]
    end

    subgraph API ["API & Policy Gateway (FastAPI / Python 3.12)"]
        CaseRoute["POST /cases (Run to Review Gate)"]
        ReviewRoute["POST /cases/{id}/review (Approve / Reject)"]
        TraceRoute["GET /cases/{id}/trace (Ordered Audit)"]
    end

    subgraph Orchestrator ["Agentic State Machine (LangGraph)"]
        N_Intake["1. intake\n(Persist Case Record)"]
        N_Evidence["2. gather_evidence\n(Parallel Tool Execution)"]
        N_Brief["3. build_brief\n(LLM Analysis or Fallback)"]
        N_Gate["4. policy_gate\n(Block Writes & Await Human)"]
    end

    subgraph Tools ["Bounded Evidence Tools (Read-Only)"]
        T_KB["search_knowledge\n(Runbooks: kb-*)"]
        T_Cases["find_similar_cases\n(Incidents: inc-*)"]
        T_Status["check_service_status\n(Signals: status-*)"]
    end

    subgraph Intelligence ["Model Boundary (OpenAI-Compatible & Fallback)"]
        LLM["OpenCode Go / DeepSeek V4\n(Structured JSON Contract)"]
        Fallback["Deterministic Offline Engine\n(Request-Shaped Heuristics)"]
    end

    subgraph HumanGate ["Human-in-the-Loop Boundary"]
        Operator["Operator Review\n(Edit Priority / Facts / Reply)"]
        Decision{"Decision"}
        Approve["Approve Action"]
        Reject["Reject Proposal"]
    end

    subgraph ExecutionLayer ["Mock Execution & Persistence"]
        Executor["execute_mock_incident\n(Idempotent Exactly-Once)"]
        PG[("PostgreSQL 16\n(cases, checkpoints, audit_events, mock_incidents)")]
    end

    UI --> Intake
    Intake -->|"POST /cases"| CaseRoute
    CaseRoute --> N_Intake
    N_Intake --> N_Evidence

    N_Evidence --> T_KB
    N_Evidence --> T_Cases
    N_Evidence --> T_Status
    T_KB & T_Cases & T_Status -->|"Validated Evidence[]"| N_Brief

    N_Brief -->|"Structured Prompt"| LLM
    LLM -.->|"Failure / Timeout"| Fallback
    LLM & Fallback -->|"ModelOutput"| N_Brief

    N_Brief --> N_Gate
    N_Gate -->|"Persist State"| PG
    N_Gate -->|"awaiting_human_review"| Workspace

    Workspace --> GateModal
    GateModal -->|"POST /cases/{id}/review"| ReviewRoute
    ReviewRoute --> Operator
    Operator --> Decision

    Decision -->|Approve| Approve
    Decision -->|Reject| Reject

    Approve --> Executor
    Executor -->|"Insert Once"| PG
    Reject -->|"Record Rejection"| PG
    TraceRoute -->|"Query Chronological Trace"| PG
    PG --> TraceUI
```

---

## 🌟 Architectural Highlights

<table>
<tr>
<td width="50%">

### 🛡️ Bounded Autonomy & Policy Gate
* **Zero Autonomous Writes**: The LLM has strictly zero write privileges in external systems.
* **Drafts by Code**: High-risk actions (`create_incident`) are generated purely as proposals and blocked by backend code.
* **Explicit Authorization**: Side effects execute only upon an explicit `POST /cases/{id}/review` signed off by an operator.

</td>
<td width="50%">

### 🔍 Multi-Source Evidence Grounding
* **Parallel Tool Calling**: Gathers evidence across Runbooks (`kb-*`), Historical Incidents (`inc-*`), and Live Monitoring (`status-*`).
* **Traceable Lineage**: Every claim in the resolution brief references an immutable `source_id`.
* **Strict Fact Isolation**: Clearly separates customer statements, tool evidence, model inferences, and missing data.

</td>
</tr>
<tr>
<td width="50%">

### ⚙️ LangGraph State & Dual-Engine Resilience
* **Durable StateGraph**: Checkpoints saved to PostgreSQL for pause, inspection, and review resumption.
* **Seamless Fallback**: If LLM API keys are absent, the provider times out, or schema validation fails, a request-shaped deterministic offline engine takes over with **zero downtime**.
* **Pydantic v2 Boundary**: `extra="forbid"` JSON schema validation rejects prompt injection or unauthorized payload additions.

</td>
<td width="50%">

### 📜 Immutable Audit Trail & Idempotency
* **Ordered Event Sourcing**: Every state transition, tool call input/output summary, and human edit is persisted with strict `(case_id, sequence)` uniqueness.
* **Exactly-Once Execution**: Primary-key constraints in `mock_incidents` ensure duplicate approvals never create duplicate tickets.
* **Human Edits as Ground Truth**: Operator modifications override AI inferences and form the case's effective final state.

</td>
</tr>
</table>

---

## 🕹️ Interactive Demo Scenarios

The system includes five synthetic catalog scenarios with specialized runbooks, incident histories, and telemetry signals:

| Scenario | Category | Default Priority | Matched Evidence Sources |
|---|---|---|---|
| **Portal Login 500** | `incident/access` | **P1 (High Risk)** | `kb-auth-5xx-after-release`, `inc-104`, `status-portal-auth-5xx` |
| **VPN Certificate Swap** | `incident/network` | **P1 (High Risk)** | `kb-vpn-certificate-rotation`, `inc-218`, `status-vpn-gateway` |
| **Invoice PDF Timeout** | `incident/billing` | **P2 (Medium Risk)** | `kb-invoice-pdf-timeout`, `inc-311`, `status-billing-export` |
| **Outbound Email Delay** | `incident/messaging` | **P2 (Medium Risk)** | `kb-outbound-email-delay`, `inc-402`, `status-smtp-queue` |
| **Okta SSO MFA Loop** | `incident/identity` | **P1 (High Risk)** | `kb-sso-mfa-loop`, `inc-155`, `status-idp-sso` |

---

## 🔌 API Specification

| Method | Endpoint | Description | Role / Gate |
|---|---|---|---|
| `POST` | `/cases` | Create a case and run LangGraph intake through evidence gathering to the review gate | System / Intake |
| `GET` | `/cases/{case_id}` | Retrieve persisted workflow checkpoint, triage, evidence, brief, and provider provenance | Operator / Reviewer |
| `POST` | `/cases/{case_id}/review` | Submit operator corrections, edited customer reply, and approve/reject decision | Human Policy Gate |
| `GET` | `/cases/{case_id}/trace` | Retrieve immutable, chronological audit trail with correlated event sequence | Audit / Compliance |
| `GET` | `/artifacts` | List all fixture entries across Knowledge, Incidents, and Service Status | Knowledge Catalog |
| `POST` | `/artifacts` | Add or update a fixture entry dynamically in the catalogue | Admin / Catalog |
| `DELETE` | `/artifacts/{source_id}` | Remove a fixture entry from the active catalogue | Admin / Catalog |

---

## 🛠️ Technology Stack

<table>
<tr>
<td align="center" width="25%">

**Orchestration & AI**

![LangGraph](https://img.shields.io/badge/-LangGraph-FF6F00?style=flat-square&logo=diagram&logoColor=white)
![OpenAI](https://img.shields.io/badge/-OpenAI_Compatible-412991?style=flat-square&logo=openai&logoColor=white)
![DeepSeek](https://img.shields.io/badge/-DeepSeek_V4_Flash-0066FF?style=flat-square&logo=databricks&logoColor=white)
![Pydantic](https://img.shields.io/badge/-Pydantic_v2-E92063?style=flat-square&logo=pydantic&logoColor=white)

</td>
<td align="center" width="25%">

**Backend Core**

![FastAPI](https://img.shields.io/badge/-FastAPI_0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/-Python_3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/-SQLAlchemy_2.0-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![HTTPX](https://img.shields.io/badge/-HTTPX-029FDF?style=flat-square&logo=httpx&logoColor=white)

</td>
<td align="center" width="25%">

**Database & Persistence**

![PostgreSQL](https://img.shields.io/badge/-PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Alembic](https://img.shields.io/badge/-Alembic-6BA81E?style=flat-square&logo=alembic&logoColor=white)
![Psycopg](https://img.shields.io/badge/-Psycopg_3-2F6792?style=flat-square&logo=postgresql&logoColor=white)

</td>
<td align="center" width="25%">

**Frontend & Quality**

![React](https://img.shields.io/badge/-React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/-TypeScript_5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/-Vite_6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Playwright](https://img.shields.io/badge/-Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)
![Pytest](https://img.shields.io/badge/-Pytest-0A9EDC?style=flat-square&logo=pytest&logoColor=white)

</td>
</tr>
</table>

---

## 🚀 Quick Start

### 1. Run with Docker Compose (Recommended)

Start PostgreSQL 16 and the FastAPI backend:

```powershell
docker compose up --build
```

Access points:
* 🌐 **Reviewer Workspace UI**: [http://localhost:5173](http://localhost:5173)
* 📚 **Interactive Swagger API Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* 🔍 **API Health Check**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

---

### 2. Local Development Setup

The project uses [uv](https://docs.astral.sh/uv/) for Python dependency management and Node.js for the frontend.

#### Backend:
```powershell
# Sync dependencies and run database migrations
uv sync --all-groups
uv run alembic upgrade head

# Start FastAPI development server
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### Frontend:
```powershell
cd frontend
npm install
npm run dev
```

---

## 🧪 Quality & Verification Suite

The repository maintains strict test coverage across unit, database integration, accessibility, and E2E layers:

```powershell
# Backend verification (Pytest, Ruff, Mypy)
uv run pytest -q
uv run ruff check .
uv run mypy app

# Frontend verification (Vitest, ESLint, TypeScript)
cd frontend
npm test
npm run lint
npm run typecheck
$env:VITE_API_BASE_URL="http://127.0.0.1:8000"; npm run build
npm run check:bundle

# E2E & Accessibility verification (Playwright & Axe-Core)
npx playwright install chromium
npm run test:e2e
```

---

## 📂 Project Structure

```text
ai-support-operator-copilot/
├── app/
│   ├── api/             # FastAPI REST routes, schemas, rate-limiting
│   ├── domain/          # Pydantic contracts (Case, Evidence, Triage, AuditEvent)
│   ├── graph/           # LangGraph StateGraph, nodes, policy gate
│   ├── llm/             # OpenAI-compatible JSON client & deterministic fallback
│   ├── persistence/     # SQLAlchemy 2.0 models, migrations, repositories
│   └── tools/           # Bounded read-only retrieval tools (KB, Cases, Status)
├── frontend/            # React 19 / TypeScript Reviewer SPA
│   ├── src/
│   │   ├── api/         # Typed API clients & TanStack Query hooks
│   │   ├── app/         # AppShell, ErrorBoundary, navigation layout
│   │   ├── components/  # Primitives (Badge, Button, Card, Dialog, TextField)
│   │   ├── features/    # Case review workspace, intake form, trace timeline
│   │   └── pages/       # HomePage, CasePage, NewCasePage, ArtifactsPage
│   └── e2e/             # Playwright E2E and Axe accessibility test suite
├── fixtures/            # Validated synthetic catalogues (Runbooks, Incidents, Status)
│   ├── knowledge/       # Synthetic Runbooks (kb-*)
│   ├── similar_cases.json # Synthetic Past Incidents (inc-*)
│   └── service_status.json # Synthetic Telemetry Signals (status-*)
├── tests/               # Pytest suite & repository language guards
├── docs/                # Architecture, Product specs, Demo scripts, UI plans
├── compose.yaml         # PostgreSQL 16 & API container definitions
└── pyproject.toml       # Locked Python 3.12 project configuration
```

---

## 🎯 Core Engineering Principles

 1. **Stateful Agentic Workflows**: Building transparent, reproducible multi-step graphs with LangGraph instead of chaotic, uncontrollable multi-agent supervisors.
 2. **Enterprise Safety & Policy Enforcement**: Proving that AI can analyze and draft recommendations without granting write access to production systems.
 3. **Structured Boundary Design**: Strict Pydantic v2 `extra="forbid"` parsing preventing prompt injection and hallucinated action parameters.
 4. **Resilient Dual-Engine Fallback**: Graceful degradation to deterministic heuristics when third-party model providers fail.
 5. **High-Standard Software Engineering**: End-to-end type safety (Python `mypy --strict`, TypeScript `strict: true`), immutable audit trails, and 100% test automation.

---

## 📄 License

This project is licensed under the terms of the [MIT License](LICENSE).
