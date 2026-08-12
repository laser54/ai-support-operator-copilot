# AI Support Operator Copilot — рабочий контекст

## Миссия

Собрать небольшой, но реально работающий API-first кейс: AI помогает оператору разобрать свободный support-запрос, показывает доказательства и предлагаемый следующий шаг; человек редактирует результат и разрешает внешнее действие. Система должна быть объяснимой и безопасной, а не выглядеть как произвольный чат-бот.

## Неподвижные решения

- Новый отдельный private repository; не форк `support_operator_panel` и не переписывай `assist-craft-qna`.
- Первый этап без большого фронтенда. FastAPI docs, JSON и тесты — основной демонстрационный слой.
- Fixture/mock data only. Не использовать реальные клиентские данные, токены, CRM или ticketing.
- Один явный LangGraph workflow вместо multi-agent supervisor zoo.
- Retrieval/knowledge — инструмент внутри workflow, не самостоятельный «агент».
- Любая write-операция требует persisted human approval; mock executor нужен, чтобы это проверить без внешнего эффекта.
- Не заявлять production readiness, реальные метрики качества или бизнес-результаты без измерений.

## First vertical slice

Input: свободное обращение об ошибке входа после обновления.

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
