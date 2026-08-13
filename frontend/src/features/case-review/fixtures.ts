import { DEMO_REQUEST } from "../intake/constants";
import type { CaseResponse, TraceResponse } from "../../api/types";

export const sampleCase: CaseResponse = {
  case_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  request_text: DEMO_REQUEST,
  status: "awaiting_human_review",
  provider: "deterministic_fallback",
  fallback_reason: "provider_not_configured",
  triage: {
    category: "incident",
    priority: "P1",
    risk: "high",
    confidence: 0.86,
    missing_information: ["first observed timestamp"],
  },
  evidence: [
    {
      source_type: "knowledge",
      source_id: "kb-auth-5xx-after-release",
      excerpt: "Reset auth sessions after a 5xx release.",
      tool_name: "search_knowledge",
      observed_at: "2026-08-12T10:42:00Z",
      source_url: null,
    },
    {
      source_type: "similar_case",
      source_id: "inc-104",
      excerpt: "INC-104 was routed to Engineering.",
      tool_name: "find_similar_cases",
      observed_at: "2026-08-12T10:42:00Z",
      source_url: null,
    },
    {
      source_type: "service_status",
      source_id: "status-portal-auth-5xx",
      excerpt: "Elevated 5xx rates after 10:42.",
      tool_name: "check_service_status",
      observed_at: "2026-08-12T10:42:00Z",
      source_url: null,
    },
  ],
  resolution_brief: {
    requester_facts: ["Sales employees cannot sign in after an update."],
    inferences: ["The failure is consistent with a post-release auth 5xx incident."],
    missing_information: ["first observed timestamp", "affected account example"],
    evidence: [],
    proposed_actions: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "create_incident",
        payload_preview: "create_incident: portal auth 5xx",
        risk: "high",
        approval_required: true,
        state: "proposed",
      },
    ],
    reply_draft: "We have recorded the access incident and are checking it with Engineering.",
  },
};

export const sampleTrace: TraceResponse = {
  case_id: sampleCase.case_id,
  events: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      case_id: sampleCase.case_id,
      sequence: 1,
      timestamp: "2026-08-12T10:42:00Z",
      event_type: "case_created",
      actor_type: "system",
      actor_id: "case-workflow",
      name: "intake",
      input_summary: "workflow_input=metadata_only",
      output_summary: "request=demo",
      correlation_id: "00000000-0000-4000-8000-000000000099",
    },
  ],
};
