import { RotateCcw, Save, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CaseResponse, Priority, ReviewRequest, SaveDraftRequest } from "../../api/types";
import { ApprovalCard } from "../../components/patterns/ApprovalCard";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { Dialog } from "../../components/primitives/Dialog";
import { SectionHeading } from "../../components/primitives/SectionHeading";
import { TextArea } from "../../components/primitives/TextArea";
import { TextField } from "../../components/primitives/TextField";
import { DEFAULT_REVIEW_ACTOR } from "./constants";
import {
  buildReviewRequest,
  buildSaveDraftRequest,
  initialReviewFromCase,
  isDirty,
  isModifiedFromAi,
  localReviewFromCase,
  savedReviewFromCase,
} from "./edits";
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
  onReload,
  onSubmit,
  onSaveDraft,
  onResetDraft,
  draftBusy = false,
  draftError,
  draftConflict = false,
}: {
  caseData: CaseResponse;
  busy: boolean;
  error?: string;
  conflict?: boolean;
  policyTraceHref?: string;
  executionTraceHref?: string;
  onReload?: () => void;
  onSubmit: (body: ReviewRequest) => void;
  onSaveDraft?: (body: SaveDraftRequest) => void;
  onResetDraft?: () => void;
  draftBusy?: boolean;
  draftError?: string;
  draftConflict?: boolean;
}) {
  const [local, setLocal] = useState(() => localReviewFromCase(caseData, DEFAULT_REVIEW_ACTOR));
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [editingReply, setEditingReply] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resetDraftOpen, setResetDraftOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const prevCaseIdRef = useRef(caseData.case_id);
  const dirty = isDirty(caseData, local);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const caseIdChanged = prevCaseIdRef.current !== caseData.case_id;
    prevCaseIdRef.current = caseData.case_id;

    if (caseIdChanged || !dirtyRef.current) {
      setLocal(localReviewFromCase(caseData, DEFAULT_REVIEW_ACTOR));
      setEditingAnalysis(false);
      setEditingReply(false);
      setApproveOpen(false);
      setRejectOpen(false);
      setResetDraftOpen(false);
      setRejectComment("");
    }
  }, [caseData]);

  // Warn operator if navigating away or closing window with unsaved edits
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  const incident = caseData.resolution_brief.proposed_actions.find(
    (action) => action.kind === "create_incident",
  );
  const mockRef = incident?.execution_result?.external_reference;
  const awaiting = caseData.status === "awaiting_human_review";

  function resetToSaved() {
    setLocal(savedReviewFromCase(caseData, local.actor));
    setEditingAnalysis(false);
    setEditingReply(false);
  }

  function handleSaveDraft() {
    if (onSaveDraft) {
      onSaveDraft(buildSaveDraftRequest(caseData, local));
    }
  }

  function handleConfirmResetDraft() {
    setResetDraftOpen(false);
    setLocal(initialReviewFromCase(caseData, local.actor));
    setEditingAnalysis(false);
    setEditingReply(false);
    if (onResetDraft) {
      onResetDraft();
    }
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
  const hasModifiedFromAi = isModifiedFromAi(caseData, local);

  return (
    <div className={styles.stack}>
      <Card tone="human">
        <div className={styles.cardBannerHuman}>
          <Shield size={12} aria-hidden="true" />
          <span>Human Review Gate · Operator Action Required</span>
        </div>
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

        <TextArea
          label="Review comment / internal notes"
          hint="Optional notes saved with draft and review decisions"
          value={local.comment}
          onChange={(event) => setLocal({ ...local, comment: event.target.value })}
        />

        <div className={styles.draftToolbar}>
          <div className={styles.draftStatusGroup}>
            {dirty ? (
              <Badge tone="warning">Unsaved changes</Badge>
            ) : caseData.review_draft ? (
              <Badge tone="success">
                Draft saved (v{caseData.review_draft.draft_version} · {new Date(caseData.review_draft.saved_at).toLocaleTimeString()})
              </Badge>
            ) : (
              <Badge tone="neutral">Initial AI suggestions</Badge>
            )}
          </div>
          <div className={styles.draftActionsGroup}>
            <Button
              variant="secondary"
              onClick={() => setResetDraftOpen(true)}
              disabled={busy || draftBusy || (!caseData.review_draft && !hasModifiedFromAi)}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset draft
            </Button>
            <Button
              variant="secondary"
              onClick={handleSaveDraft}
              loading={draftBusy}
              disabled={busy || (!dirty && !draftError && !caseData.review_draft)}
            >
              <Save size={13} aria-hidden="true" />
              Save draft
            </Button>
          </div>
        </div>

        {dirty ? (
          <Callout tone="warning" title="Unsaved local edits">
            <p>These values are not stored until you save a draft, approve, or reject.</p>
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
            <Button variant="secondary" onClick={resetToSaved}>
              Reset edits
            </Button>
          </Callout>
        ) : null}
      </Card>

      {draftError ? (
        <Callout
          tone="danger"
          title={draftConflict ? "Draft conflict (outdated version)" : "Failed to save draft"}
        >
          <p role="alert">{draftError}</p>
          {draftConflict ? (
            <div>
              <p>
                This draft was updated by another operator or tab. Your local edits have been preserved.
                Reload the latest case state before saving again.
              </p>
              {onReload ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <Button variant="secondary" onClick={onReload}>
                    Reload case
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: "0.5rem" }}>
              <Button variant="secondary" onClick={handleSaveDraft} loading={draftBusy}>
                Retry saving draft
              </Button>
            </div>
          )}
        </Callout>
      ) : null}

      <div className={styles.bar}>
        <ApprovalCard
          title="Human review gate"
          summary={incident?.payload_preview ?? "No incident proposal"}
          busy={busy || draftBusy}
          onApprove={() => setApproveOpen(true)}
          onReject={() => {
            setRejectComment(local.comment);
            setRejectOpen(true);
          }}
        />
        <p>
          <a href={policyTraceHref}>View policy gate in trace</a>
        </p>
      </div>
      {error ? (
        <Callout
          tone="danger"
          title={conflict ? "Review conflict (outdated version)" : "The review could not be saved"}
        >
          <p role="alert">{error}</p>
          {conflict ? (
            <div>
              <p>
                This case was updated by another operator or tab. Your local edits have been preserved.
                Reload the latest case state before submitting again.
              </p>
              {onReload ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <Button variant="secondary" onClick={onReload}>
                    Reload case
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </Callout>
      ) : null}

      <Dialog
        open={resetDraftOpen}
        busy={busy || draftBusy}
        title="Reset review draft"
        onClose={() => setResetDraftOpen(false)}
      >
        <p>
          Are you sure you want to reset the review draft? This will discard your saved draft and
          restore original AI suggestions.
        </p>
        <div className={styles.dialogActions}>
          <Button
            variant="danger"
            loading={draftBusy}
            onClick={handleConfirmResetDraft}
          >
            Confirm reset
          </Button>
          <Button
            variant="secondary"
            onClick={() => setResetDraftOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={approveOpen}
        busy={busy}
        title="Approve and create mock incident"
        onClose={() => setApproveOpen(false)}
      >
        <p>Effective priority: {request.edits?.priority ?? local.priority}</p>
        <p>Effective reply: {request.edits?.reply_draft ?? local.replyDraft}</p>
        {local.comment ? <p>Comment: {local.comment}</p> : null}
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
          value={rejectComment}
          onChange={(event) => setRejectComment(event.target.value)}
        />
        <p>Rejection will not create a mock incident.</p>
        <div className={styles.dialogActions}>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => onSubmit(buildReviewRequest(caseData, local, "reject", rejectComment))}
          >
            Confirm rejection
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
