export type CaseStatus = "received" | "awaiting_human_review" | "rejected" | "completed";

export type Priority = "P1" | "P2" | "P3" | "P4";

export type RiskLevel = "low" | "medium" | "high";

export type EvidenceSourceType = "knowledge" | "similar_case" | "service_status";

export type ActionKind = "create_incident" | "request_information";

export type ActionState = "proposed" | "approved" | "rejected" | "executed";

export type ReviewDecision = "approve" | "reject";

export type ActorType = "system" | "operator" | "tool";

export type ArtifactEntry = {
  source_type: EvidenceSourceType;
  source_id: string;
  title: string;
  excerpt: string;
  keywords: string[];
  observed_at: string;
};

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

export type ReviewEdits = {
  priority?: Priority;
  reply_draft?: string;
  requester_facts?: string[];
};

export type ReviewRecord = {
  id: string;
  actor: string;
  decision: ReviewDecision;
  comment?: string | null;
  reviewed_at: string;
  edits?: ReviewEdits;
};

export type ReviewDraftRecord = {
  actor: string;
  priority?: Priority | null;
  reply_draft?: string | null;
  requester_facts?: string[] | null;
  comment?: string | null;
  draft_version: number;
  saved_at: string;
};

export type SaveDraftRequest = {
  actor: string;
  priority?: Priority | null;
  reply_draft?: string | null;
  requester_facts?: string[] | null;
  comment?: string | null;
  expected_draft_version?: number | null;
};

export type ResetDraftRequest = {
  actor?: string;
  expected_draft_version?: number | null;
};

export type ClarificationRecord = {
  id: string;
  text: string;
  author: string;
  created_at: string;
};

export type CaseRevisionRecord = {
  revision_number: number;
  created_at: string;
  triggered_by: string;
  clarification_id?: string | null;
  triage: Triage;
  evidence: Evidence[];
  resolution_brief: ResolutionBrief;
  provider: string;
  fallback_reason?: string | null;
  model?: string | null;
};

export type AddClarificationRequest = {
  text: string;
  author?: string;
  idempotency_key?: string | null;
  discard_draft?: boolean;
};

export type CaseResponse = {
  case_id: string;
  status: CaseStatus;
  version: number;
  request_text: string;
  triage: Triage;
  evidence: Evidence[];
  resolution_brief: ResolutionBrief;
  provider: string;
  fallback_reason: string | null;
  model: string | null;
  review?: ReviewRecord | null;
  review_draft?: ReviewDraftRecord | null;
  clarifications?: ClarificationRecord[];
  revisions?: CaseRevisionRecord[];
  current_revision?: number;
};

export type CreateCaseRequest = {
  request_text: string;
};

export type ReviewRequest = {
  actor: string;
  edits?: ReviewEdits;
  decision: ReviewDecision;
  comment?: string | null;
  expected_version: number;
  idempotency_key: string;
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

export type CaseQueueItem = {
  case_id: string;
  status: CaseStatus;
  priority: Priority;
  risk: RiskLevel | null;
  request_text: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CaseQueueResponse = {
  items: CaseQueueItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type CaseQueueParams = {
  status?: CaseStatus | "";
  priority?: Priority | "";
  q?: string;
  page?: number;
  page_size?: number;
};
