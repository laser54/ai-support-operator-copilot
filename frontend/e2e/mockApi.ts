import type { Page } from "@playwright/test";

import type {
  AuditEvent,
  CaseQueueItem,
  CaseQueueResponse,
  CaseResponse,
  CreateCaseRequest,
  ReviewRequest,
  TraceResponse,
} from "../src/api/types";
import { sampleCase, sampleTrace } from "../src/features/case-review/fixtures";

const API = "http://127.0.0.1:8000";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Accept,Content-Type",
};

type Store = {
  case: CaseResponse;
  trace: TraceResponse;
  created_at: string;
  updated_at: string;
};

function json(status: number, body: unknown) {
  return {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function addEvent(store: Store, eventType: string, name: string, summary: string) {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    case_id: store.case.case_id,
    sequence: store.trace.events.length + 1,
    timestamp: "2026-08-13T00:00:00Z",
    event_type: eventType,
    actor_type: "operator",
    actor_id: "operator@example.test",
    name,
    input_summary: "review_input=metadata_only",
    output_summary: summary,
    correlation_id: `corr-${store.trace.events.length + 1}`,
  };
  store.trace.events.push(event);
}

function applyReview(store: Store, body: ReviewRequest): CaseResponse {
  if (store.case.status === "completed" || store.case.status === "rejected") {
    return store.case;
  }

  if (body.edits?.priority) {
    store.case.triage.priority = body.edits.priority;
  }
  if (body.edits?.reply_draft) {
    store.case.resolution_brief.reply_draft = body.edits.reply_draft;
  }
  if (body.edits?.requester_facts) {
    store.case.resolution_brief.requester_facts = body.edits.requester_facts;
  }

  const summary = `decision=${body.decision}`;
  addEvent(store, "review_recorded", "human_review", summary);
  if (body.decision === "reject") {
    store.case.status = "rejected";
    store.case.resolution_brief.proposed_actions = store.case.resolution_brief.proposed_actions.map(
      (action) => ({ ...action, state: "rejected" as const }),
    );
    addEvent(store, "action_rejected", "policy_gate", summary);
    return store.case;
  }

  store.case.status = "completed";
  store.case.resolution_brief.proposed_actions = store.case.resolution_brief.proposed_actions.map(
    (action) =>
      action.kind === "create_incident"
        ? {
            ...action,
            state: "executed" as const,
            execution_result: {
              external_reference: "MOCK-1",
              executed_at: "2026-08-13T00:01:00Z",
              message: "Mock incident stored once.",
            },
          }
        : action,
  );
  addEvent(store, "action_approved", "policy_gate", summary);
  addEvent(store, "action_executed", "execute_mock_incident", summary);
  store.updated_at = new Date().toISOString();
  return store.case;
}

export async function installMockApi(page: Page) {
  const cases = new Map<string, Store>();

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }

    if (method === "GET" && path === "/cases") {
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const q = url.searchParams.get("q")?.toLowerCase();
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size")) || 10));

      let allItems: CaseQueueItem[] = Array.from(cases.values()).map((store) => ({
        case_id: store.case.case_id,
        status: store.case.status,
        priority: store.case.triage.priority,
        risk: store.case.triage.risk,
        request_text: store.case.request_text,
        version: store.case.version ?? 1,
        created_at: store.created_at,
        updated_at: store.updated_at,
      }));

      if (status && status !== "all") {
        allItems = allItems.filter((item) => item.status === status);
      }
      if (priority) {
        allItems = allItems.filter((item) => item.priority === priority);
      }
      if (q) {
        allItems = allItems.filter(
          (item) => item.case_id.toLowerCase() === q || item.request_text.toLowerCase().includes(q),
        );
      }

      allItems.sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.case_id.localeCompare(a.case_id);
      });

      const total = allItems.length;
      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
      const items = allItems.slice((page - 1) * pageSize, page * pageSize);

      await route.fulfill(
        json(200, {
          items,
          total,
          page,
          page_size: pageSize,
          total_pages: totalPages,
        } satisfies CaseQueueResponse),
      );
      return;
    }

    if (method === "POST" && path === "/cases") {
      const id = crypto.randomUUID();
      const postBody = request.postDataJSON() as CreateCaseRequest | null;
      const created = clone(sampleCase);
      created.case_id = id;
      if (postBody?.request_text) {
        created.request_text = postBody.request_text;
      }
      const trace = clone(sampleTrace);
      trace.case_id = id;
      for (const event of trace.events) {
        event.case_id = id;
      }
      const now = new Date().toISOString();
      cases.set(id, { case: created, trace, created_at: now, updated_at: now });
      await route.fulfill(json(201, created));
      return;
    }

    const reviewMatch = path.match(/^\/cases\/([^/]+)\/review$/);
    if (method === "POST" && reviewMatch) {
      const store = cases.get(reviewMatch[1] ?? "");
      if (!store) {
        await route.fulfill(
          json(404, { error: { code: "not_found", message: "case not found" } }),
        );
        return;
      }
      const body = request.postDataJSON() as ReviewRequest;
      await route.fulfill(json(200, applyReview(store, body)));
      return;
    }

    const traceMatch = path.match(/^\/cases\/([^/]+)\/trace$/);
    if (method === "GET" && traceMatch) {
      const store = cases.get(traceMatch[1] ?? "");
      if (!store) {
        await route.fulfill(
          json(404, { error: { code: "not_found", message: "case not found" } }),
        );
        return;
      }
      await route.fulfill(json(200, store.trace));
      return;
    }

    const caseMatch = path.match(/^\/cases\/([^/]+)$/);
    if (method === "GET" && caseMatch) {
      const store = cases.get(caseMatch[1] ?? "");
      if (!store) {
        await route.fulfill(
          json(404, { error: { code: "not_found", message: "case not found" } }),
        );
        return;
      }
      await route.fulfill(json(200, store.case));
      return;
    }

    await route.fulfill(json(404, { error: { code: "not_found", message: "not found" } }));
  });
}
