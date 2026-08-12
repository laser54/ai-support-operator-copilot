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
- No premature vector DB, auth or React dashboard.

## Verification target

A reviewer should be able to run tests and follow one documented demo from request to human approval, inspect the exact tool calls/evidence, and verify that the action was impossible before approval.
