import type { CaseResponse, Priority, ReviewEdits, ReviewRequest } from "../../api/types";

export type LocalReview = {
  actor: string;
  priority: Priority;
  replyDraft: string;
  requesterFacts: string;
};

export function localReviewFromCase(caseData: CaseResponse, actor: string): LocalReview {
  return {
    actor,
    priority: caseData.triage.priority,
    replyDraft: caseData.resolution_brief.reply_draft,
    requesterFacts: caseData.resolution_brief.requester_facts.join("\n"),
  };
}

export function parseFacts(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isDirty(caseData: CaseResponse, local: LocalReview): boolean {
  return (
    local.priority !== caseData.triage.priority ||
    local.replyDraft !== caseData.resolution_brief.reply_draft ||
    JSON.stringify(parseFacts(local.requesterFacts)) !==
      JSON.stringify(caseData.resolution_brief.requester_facts)
  );
}

export function buildReviewRequest(
  caseData: CaseResponse,
  local: LocalReview,
  decision: ReviewRequest["decision"],
  comment?: string,
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
  return {
    actor: local.actor.trim(),
    edits,
    decision,
    comment: comment?.trim() ? comment.trim() : null,
  };
}
