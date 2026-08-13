export type CaseStatus = "received" | "awaiting_human_review" | "rejected" | "completed";

export type Priority = "P1" | "P2" | "P3" | "P4";

export type RiskLevel = "low" | "medium" | "high";

export type EvidenceSourceType = "knowledge" | "similar_case" | "service_status";

export type ActionKind = "create_incident" | "request_information";

export type ActionState = "proposed" | "approved" | "rejected" | "executed";

export type ReviewDecision = "approve" | "reject";

export type ActorType = "system" | "operator" | "tool";

export type Triage = {
  category: string;
  priority: Priority;
  risk: RiskLevel;
  confidence: number;
  missing_information: string[];
};

export type Evidence = {
  source_type: EvidenceSourceType;
  source_id: string;
  excerpt: string;
  tool_name: string;
  observed_at: string;
  source_url: string | null;
};

export type ProposedAction = {
  id: string;
  kind: ActionKind;
  payload_preview: string;
  risk: RiskLevel;
  approval_required: boolean;
  state: ActionState;
  execution_result?: {
    external_reference: string | null;
    executed_at: string;
    message: string;
  };
};

export type ResolutionBrief = {
  requester_facts: string[];
  evidence: Evidence[];
  inferences: string[];
  missing_information: string[];
  proposed_actions: ProposedAction[];
  reply_draft: string;
};

export type CaseResponse = {
  case_id: string;
  status: CaseStatus;
  triage: Triage;
  evidence: Evidence[];
  resolution_brief: ResolutionBrief;
  provider: string;
  fallback_reason: string | null;
};

export type CreateCaseRequest = {
  request_text: string;
};

export type ReviewEdits = {
  priority?: Priority;
  reply_draft?: string;
  requester_facts?: string[];
};

export type ReviewRequest = {
  actor: string;
  edits?: ReviewEdits;
  decision: ReviewDecision;
  comment?: string | null;
};

export type AuditEvent = {
  id: string;
  case_id: string;
  sequence: number;
  timestamp: string;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  name: string;
  input_summary: string;
  output_summary: string;
  correlation_id: string;
};

export type TraceResponse = {
  case_id: string;
  events: AuditEvent[];
};
