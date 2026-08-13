import { Shield } from "lucide-react";
import { useEffect, useState } from "react";

import type { CaseResponse, Priority, ReviewRequest } from "../../api/types";
import { ApprovalCard } from "../../components/patterns/ApprovalCard";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { Dialog } from "../../components/primitives/Dialog";
import { SectionHeading } from "../../components/primitives/SectionHeading";
import { TextArea } from "../../components/primitives/TextArea";
import { TextField } from "../../components/primitives/TextField";
import { DEFAULT_REVIEW_ACTOR } from "./constants";
import { buildReviewRequest, isDirty, localReviewFromCase } from "./edits";
import styles from "./ReviewPanel.module.css";
import fieldStyles from "../../components/primitives/Field.module.css";

const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];

export function ReviewPanel({
  caseData,
  busy,
  error,
  conflict = false,
  policyTraceHref = "#trace",
  executionTraceHref = "#trace",
  onSubmit,
}: {
  caseData: CaseResponse;
  busy: boolean;
  error?: string;
  conflict?: boolean;
  policyTraceHref?: string;
  executionTraceHref?: string;
  onSubmit: (body: ReviewRequest) => void;
}) {
  const [local, setLocal] = useState(() => localReviewFromCase(caseData, DEFAULT_REVIEW_ACTOR));
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [editingReply, setEditingReply] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setLocal(localReviewFromCase(caseData, DEFAULT_REVIEW_ACTOR));
    setEditingAnalysis(false);
    setEditingReply(false);
    setApproveOpen(false);
    setRejectOpen(false);
    setComment("");
  }, [caseData]);

  const dirty = isDirty(caseData, local);
  const incident = caseData.resolution_brief.proposed_actions.find(
    (action) => action.kind === "create_incident",
  );
  const mockRef = incident?.execution_result?.external_reference;
  const awaiting = caseData.status === "awaiting_human_review";

  function reset() {
    setLocal(localReviewFromCase(caseData, local.actor));
    setEditingAnalysis(false);
    setEditingReply(false);
  }

  if (caseData.status === "completed") {
    return (
      <Callout tone="success" title="Mock incident created">
        <div aria-live="polite">
          <p>
            Reference {mockRef ?? "unavailable"}.{" "}
            {incident?.execution_result?.executed_at
              ? `Recorded at ${incident.execution_result.executed_at}.`
              : null}
          </p>
          <p>Repeated approval will not create another incident.</p>
          <a href={executionTraceHref}>View in trace</a>
        </div>
      </Callout>
    );
  }

  if (caseData.status === "rejected") {
    return (
      <Callout tone="info" title="Proposal rejected">
        <p aria-live="polite">No incident was created. The write action stayed blocked.</p>
      </Callout>
    );
  }

  if (!awaiting) {
    return null;
  }

  const request = buildReviewRequest(caseData, local, "approve");

  return (
    <div className={styles.stack}>
      <Card tone="human">
        <SectionHeading icon={Shield} mark="Human gate">
          Human edits
        </SectionHeading>
        <TextField
          label="Reviewer"
          value={local.actor}
          onChange={(event) => setLocal({ ...local, actor: event.target.value })}
        />
        <p>
          Effective priority: {local.priority}
          {local.priority !== caseData.triage.priority
            ? ` (AI suggested ${caseData.triage.priority})`
            : null}
        </p>
        {editingAnalysis ? (
          <>
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label} htmlFor="review-priority">
                Priority
              </label>
              <select
                id="review-priority"
                className={fieldStyles.control}
                value={local.priority}
                onChange={(event) =>
                  setLocal({ ...local, priority: event.target.value as Priority })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>
            <TextArea
              label="Requester facts"
              hint="One fact per line"
              value={local.requesterFacts}
              onChange={(event) => setLocal({ ...local, requesterFacts: event.target.value })}
            />
            <Button variant="secondary" onClick={() => setEditingAnalysis(false)}>
              Done editing analysis
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setEditingAnalysis(true)}>
            Edit analysis
          </Button>
        )}
        {editingReply ? (
          <>
            <TextArea
              label="Reply draft"
              hint={`${4000 - local.replyDraft.length} characters remaining`}
              value={local.replyDraft}
              onChange={(event) => setLocal({ ...local, replyDraft: event.target.value })}
            />
            <Button variant="secondary" onClick={() => setEditingReply(false)}>
              Done editing reply
            </Button>
          </>
        ) : (
          <>
            <p>{local.replyDraft}</p>
            <Button variant="secondary" onClick={() => setEditingReply(true)}>
              Edit reply
            </Button>
          </>
        )}
        {dirty ? (
          <Callout tone="warning" title="Unsaved local edits">
            <p>These values are not stored until you approve or reject.</p>
            <div className={styles.diffBox}>
              <p className={styles.diffHeader}>AI Suggestion vs Operator Edits</p>
              {local.priority !== caseData.triage.priority ? (
                <div className={styles.diffLine}>
                  <span className={styles.diffLabel}>Priority:</span>
                  <span className={styles.diffOld}>{caseData.triage.priority}</span>
                  <span className={styles.diffArrow}>→</span>
                  <span className={styles.diffNew}>{local.priority}</span>
                </div>
              ) : null}
              {local.replyDraft !== caseData.resolution_brief.reply_draft ? (
                <div className={styles.diffBlock}>
                  <div className={styles.diffOldBlock}>
                    <span className={styles.diffBadgeOld}>AI Draft:</span> {caseData.resolution_brief.reply_draft}
                  </div>
                  <div className={styles.diffNewBlock}>
                    <span className={styles.diffBadgeNew}>Operator Edit:</span> {local.replyDraft}
                  </div>
                </div>
              ) : null}
            </div>
            <Button variant="secondary" onClick={reset}>
              Reset edits
            </Button>
          </Callout>
        ) : null}
      </Card>

      <div className={styles.bar}>
        <ApprovalCard
          title="Human review gate"
          summary={incident?.payload_preview ?? "No incident proposal"}
          busy={busy}
          onApprove={() => setApproveOpen(true)}
          onReject={() => setRejectOpen(true)}
        />
        <p>
          <a href={policyTraceHref}>View policy gate in trace</a>
        </p>
      </div>
      {error ? (
        <Callout tone="danger" title="The review could not be saved">
          <p role="alert">{error}</p>
          {conflict ? <p>Refresh the case, then confirm the decision again.</p> : null}
        </Callout>
      ) : null}

      <Dialog
        open={approveOpen}
        busy={busy}
        title="Approve and create mock incident"
        onClose={() => setApproveOpen(false)}
      >
        <p>Effective priority: {request.edits?.priority ?? local.priority}</p>
        <p>Effective reply: {request.edits?.reply_draft ?? local.replyDraft}</p>
        <p>This creates one mock incident after the API accepts the review. No real ticket is opened.</p>
        <div className={styles.dialogActions}>
          <Button loading={busy} onClick={() => onSubmit(buildReviewRequest(caseData, local, "approve"))}>
            Confirm approval
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={rejectOpen}
        busy={busy}
        title="Reject proposal"
        onClose={() => setRejectOpen(false)}
      >
        <TextArea
          label="Reason (optional)"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <p>Rejection will not create a mock incident.</p>
        <div className={styles.dialogActions}>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => onSubmit(buildReviewRequest(caseData, local, "reject", comment))}
          >
            Confirm rejection
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
