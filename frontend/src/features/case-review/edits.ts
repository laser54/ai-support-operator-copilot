import type {
  CaseResponse,
  Priority,
  ReviewEdits,
  ReviewRequest,
  SaveDraftRequest,
} from "../../api/types";

export type LocalReview = {
  actor: string;
  priority: Priority;
  replyDraft: string;
  requesterFacts: string;
  comment: string;
};

export function initialReviewFromCase(caseData: CaseResponse, fallbackActor: string): LocalReview {
  return {
    actor: fallbackActor,
    priority: caseData.triage.priority,
    replyDraft: caseData.resolution_brief.reply_draft,
    requesterFacts: caseData.resolution_brief.requester_facts.join("\n"),
    comment: "",
  };
}

export function savedReviewFromCase(caseData: CaseResponse, fallbackActor: string): LocalReview {
  if (caseData.review_draft) {
    return {
      actor: caseData.review_draft.actor || fallbackActor,
      priority: caseData.review_draft.priority ?? caseData.triage.priority,
      replyDraft: caseData.review_draft.reply_draft ?? caseData.resolution_brief.reply_draft,
      requesterFacts: caseData.review_draft.requester_facts
        ? caseData.review_draft.requester_facts.join("\n")
        : caseData.resolution_brief.requester_facts.join("\n"),
      comment: caseData.review_draft.comment ?? "",
    };
  }
  return initialReviewFromCase(caseData, fallbackActor);
}

export function localReviewFromCase(caseData: CaseResponse, fallbackActor: string): LocalReview {
  return savedReviewFromCase(caseData, fallbackActor);
}

export function parseFacts(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isDirty(caseData: CaseResponse, local: LocalReview): boolean {
  const saved = savedReviewFromCase(caseData, local.actor);
  return (
    local.priority !== saved.priority ||
    local.replyDraft !== saved.replyDraft ||
    (local.comment ?? "").trim() !== (saved.comment ?? "").trim() ||
    JSON.stringify(parseFacts(local.requesterFacts)) !==
      JSON.stringify(parseFacts(saved.requesterFacts))
  );
}

export function isModifiedFromAi(caseData: CaseResponse, local: LocalReview): boolean {
  const initial = initialReviewFromCase(caseData, local.actor);
  return (
    local.priority !== initial.priority ||
    local.replyDraft !== initial.replyDraft ||
    Boolean((local.comment ?? "").trim()) ||
    JSON.stringify(parseFacts(local.requesterFacts)) !==
      JSON.stringify(parseFacts(initial.requesterFacts))
  );
}

export function buildSaveDraftRequest(
  caseData: CaseResponse,
  local: LocalReview,
): SaveDraftRequest {
  return {
    actor: local.actor.trim() || "operator",
    priority: local.priority,
    reply_draft: local.replyDraft,
    requester_facts: parseFacts(local.requesterFacts),
    comment: local.comment?.trim() || null,
    expected_draft_version: caseData.review_draft?.draft_version ?? 0,
  };
}

export function buildReviewRequest(
  caseData: CaseResponse,
  local: LocalReview,
  decision: ReviewRequest["decision"],
  comment?: string,
  idempotencyKey?: string,
): ReviewRequest {
  const edits: ReviewEdits = {};
  if (local.priority !== caseData.triage.priority) {
    edits.priority = local.priority;
  }
  if (local.replyDraft !== caseData.resolution_brief.reply_draft) {
    edits.reply_draft = local.replyDraft;
  }
  const facts = parseFacts(local.requesterFacts);
  if (JSON.stringify(facts) !== JSON.stringify(caseData.resolution_brief.requester_facts)) {
    edits.requester_facts = facts;
  }
  const effectiveComment = comment !== undefined ? comment : local.comment;
  return {
    actor: local.actor.trim(),
    edits,
    decision,
    comment: effectiveComment?.trim() ? effectiveComment.trim() : null,
    expected_version: caseData.version ?? 1,
    idempotency_key:
      idempotencyKey ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `review-${Date.now()}`),
  };
}
