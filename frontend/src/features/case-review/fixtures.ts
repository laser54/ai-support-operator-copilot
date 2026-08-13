import { DEMO_REQUEST } from "../intake/constants";
import type { ArtifactEntry, AuditEvent, CaseResponse, TraceResponse } from "../../api/types";

function event(overrides: Partial<AuditEvent> & Pick<AuditEvent, "id" | "sequence" | "event_type" | "name">): AuditEvent {
  return {
    case_id: sampleCase.case_id,
    timestamp: "2026-08-12T10:42:00Z",
    actor_type: "system",
    actor_id: "case-workflow",
    input_summary: "workflow_input=metadata_only",
    output_summary: "ok",
    correlation_id: `corr-${overrides.sequence}`,
    ...overrides,
  };
}

export const sampleCase: CaseResponse = {
  case_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  request_text: DEMO_REQUEST,
  status: "awaiting_human_review",
  provider: "deterministic_fallback",
  fallback_reason: "provider_not_configured",
  model: null,
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
    event({
      id: "00000000-0000-4000-8000-000000000001",
      sequence: 1,
      event_type: "case_created",
      name: "intake",
      output_summary: "request=demo",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000002",
      sequence: 2,
      event_type: "tool_called",
      actor_type: "tool",
      actor_id: "fixture-tools",
      name: "search_knowledge",
      output_summary: "evidence_source_ids=kb-auth-5xx-after-release",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000003",
      sequence: 3,
      event_type: "tool_called",
      actor_type: "tool",
      actor_id: "fixture-tools",
      name: "find_similar_cases",
      output_summary: "evidence_source_ids=inc-104",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000004",
      sequence: 4,
      event_type: "tool_called",
      actor_type: "tool",
      actor_id: "fixture-tools",
      name: "check_service_status",
      output_summary: "evidence_source_ids=status-portal-auth-5xx",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000005",
      sequence: 5,
      event_type: "brief_built",
      name: "build_brief",
      output_summary: "provider=deterministic_fallback; evidence_count=3",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000006",
      sequence: 6,
      event_type: "human_review_requested",
      name: "policy_gate",
      output_summary: "action_execution=blocked_pending_human_review",
    }),
  ],
};

export const approvedTrace: TraceResponse = {
  case_id: sampleCase.case_id,
  events: [
    ...sampleTrace.events,
    event({
      id: "00000000-0000-4000-8000-000000000007",
      sequence: 7,
      event_type: "review_recorded",
      actor_type: "operator",
      actor_id: "operator@example.test",
      name: "human_review",
      output_summary: "decision=approve; approval_id=rev-1",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000008",
      sequence: 8,
      event_type: "action_approved",
      actor_type: "operator",
      actor_id: "operator@example.test",
      name: "policy_gate",
      output_summary: "decision=approve; approval_id=rev-1",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000009",
      sequence: 9,
      event_type: "action_executed",
      actor_type: "operator",
      actor_id: "operator@example.test",
      name: "execute_mock_incident",
      output_summary: "decision=approve; approval_id=rev-1",
    }),
  ],
};

export const rejectedTrace: TraceResponse = {
  case_id: sampleCase.case_id,
  events: [
    ...sampleTrace.events,
    event({
      id: "00000000-0000-4000-8000-000000000010",
      sequence: 7,
      event_type: "review_recorded",
      actor_type: "operator",
      actor_id: "operator@example.test",
      name: "human_review",
      output_summary: "decision=reject; approval_id=rev-2",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000011",
      sequence: 8,
      event_type: "action_rejected",
      actor_type: "operator",
      actor_id: "operator@example.test",
      name: "policy_gate",
      output_summary: "decision=reject; approval_id=rev-2",
    }),
  ],
};

export const sampleArtifacts: ArtifactEntry[] = [
  {
    source_type: "knowledge",
    source_id: "kb-auth-5xx-after-release",
    title: "Authentication 5xx after a release",
    excerpt:
      "Synthetic runbook: if login begins returning HTTP 500 immediately after a release, declare an access incident, collect the release version and affected environment, then route the incident to Engineering.",
    keywords: ["sign in", "500 error", "portal", "http 500"],
    observed_at: "2026-08-12T10:45:00Z",
  },
  {
    source_type: "knowledge",
    source_id: "kb-vpn-certificate-rotation",
    title: "VPN failure after certificate rotation",
    excerpt:
      "Synthetic runbook: if remote VPN tunnels fail immediately after a certificate rotation, collect the gateway name and certificate expiry, then route to Network Engineering.",
    keywords: ["vpn", "certificate"],
    observed_at: "2026-08-12T11:00:00Z",
  },
  {
    source_type: "knowledge",
    source_id: "kb-invoice-pdf-timeout",
    title: "Invoice PDF export timeout",
    excerpt:
      "Synthetic runbook: if invoice PDF export jobs time out, capture the job ID and tenant, then route to Billing Platform.",
    keywords: ["invoice", "pdf"],
    observed_at: "2026-08-12T11:05:00Z",
  },
  {
    source_type: "knowledge",
    source_id: "kb-sso-mfa-loop",
    title: "SSO MFA loop",
    excerpt:
      "Synthetic runbook: if users loop on SSO MFA after an IdP change, collect the Okta policy name and affected application, then route to Identity.",
    keywords: ["sso", "mfa", "okta"],
    observed_at: "2026-08-12T11:15:00Z",
  },
  {
    source_type: "similar_case",
    source_id: "inc-104",
    title: "Portal login failures after version 4.8.0",
    excerpt:
      "Synthetic incident INC-104: elevated portal login HTTP 500 responses after deployment were owned by Engineering and mitigated by rolling back the authentication adapter.",
    keywords: ["portal", "500 error", "sign in"],
    observed_at: "2026-08-12T10:50:00Z",
  },
  {
    source_type: "similar_case",
    source_id: "inc-218",
    title: "VPN outage after certificate swap",
    excerpt:
      "Synthetic incident INC-218: remote VPN users failed handshake after a certificate rotation; Network Engineering rolled back the gateway cert.",
    keywords: ["vpn", "certificate"],
    observed_at: "2026-08-12T11:01:00Z",
  },
  {
    source_type: "similar_case",
    source_id: "inc-155",
    title: "Okta MFA loop on SSO",
    excerpt:
      "Synthetic incident INC-155: users looped on SSO MFA after an Okta policy publish; Identity reverted the factor rule.",
    keywords: ["sso", "mfa", "okta"],
    observed_at: "2026-08-12T11:16:00Z",
  },
  {
    source_type: "service_status",
    source_id: "status-portal-auth-5xx",
    title: "Portal authentication status",
    excerpt:
      "Synthetic status signal: portal authentication 5xx rate has been elevated since 10:42 UTC after the scheduled update.",
    keywords: ["portal", "500 error", "sign in"],
    observed_at: "2026-08-12T10:52:00Z",
  },
  {
    source_type: "service_status",
    source_id: "status-vpn-gateway",
    title: "VPN gateway status",
    excerpt:
      "Synthetic status signal: VPN gateway handshake failures are elevated after the certificate rotation.",
    keywords: ["vpn", "certificate"],
    observed_at: "2026-08-12T11:02:00Z",
  },
  {
    source_type: "service_status",
    source_id: "status-idp-sso",
    title: "SSO IdP status",
    excerpt:
      "Synthetic status signal: Okta MFA challenge success rate dropped; users report SSO loops.",
    keywords: ["sso", "mfa", "okta"],
    observed_at: "2026-08-12T11:17:00Z",
  },
];
