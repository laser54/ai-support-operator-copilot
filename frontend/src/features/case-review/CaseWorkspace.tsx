import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  History,
  MessageSquareQuote,
  Pencil,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { Link, useParams } from "react-router";

import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { getApiBaseUrl, getCasesApi } from "../../api/runtime";
import type {
  AddClarificationRequest,
  CaseResponse,
  ReviewRequest,
  SaveDraftRequest,
  TraceResponse,
} from "../../api/types";
import { ContextCard } from "../../components/patterns/ContextCard";
import { ConfidenceMeter } from "../../components/patterns/ConfidenceMeter";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { Dialog } from "../../components/primitives/Dialog";
import { SectionHeading } from "../../components/primitives/SectionHeading";
import { TextArea } from "../../components/primitives/TextArea";
import { TextField } from "../../components/primitives/TextField";
import { TraceTimeline } from "../trace/TraceTimeline";
import { eventAnchorId, firstEventOfType, toolEventForSource } from "../trace/labels";
import { ReviewPanel } from "./ReviewPanel";
import { provenanceLabel, statusLabel, workflowItems } from "./status";
import styles from "./CaseWorkspace.module.css";

type Loaders = {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
  submitReview?: (caseId: string, body: ReviewRequest) => Promise<CaseResponse>;
  saveDraft?: (caseId: string, body: SaveDraftRequest) => Promise<CaseResponse>;
  resetDraft?: (caseId: string, actor?: string, expectedDraftVersion?: number | null) => Promise<CaseResponse>;
  addClarification?: (caseId: string, body: AddClarificationRequest) => Promise<CaseResponse>;
  copyText?: (value: string) => Promise<void>;
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById(id)?.focus();
}

export function CaseWorkspace({
  loadCase,
  loadTrace,
  submitReview,
  saveDraft,
  resetDraft,
  addClarification,
  copyText,
}: Loaders) {
  const { caseId = "" } = useParams();
  const [copyReplyState, setCopyReplyState] = useState<"idle" | "success" | "error">("idle");
  const [copyReplyError, setCopyReplyError] = useState<string | null>(null);
  const [clarificationText, setClarificationText] = useState("");
  const [clarificationAuthor, setClarificationAuthor] = useState("requester");
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `clarif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [reviewDirty, setReviewDirty] = useState(false);
  const [confirmReanalysisOpen, setConfirmReanalysisOpen] = useState(false);
  const [selectedRevisionNumber, setSelectedRevisionNumber] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const caseQuery = useQuery({
    queryKey: queryKeys.case(caseId),
    queryFn: () => (loadCase ?? getCasesApi().get)(caseId),
    enabled: caseId.length > 0,
    retry: false,
  });
  const reviewMutation = useMutation({
    mutationFn: (body: ReviewRequest) =>
      (submitReview ?? ((id, payload) => getCasesApi().review(id, payload)))(caseId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.case(caseId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.caseTrace(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.casesAll() });
    },
  });
  const saveDraftMutation = useMutation({
    mutationFn: (body: SaveDraftRequest) =>
      (saveDraft ?? ((id, payload) => getCasesApi().saveDraft(id, payload)))(caseId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.case(caseId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.caseTrace(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.casesAll() });
    },
  });
  const resetDraftMutation = useMutation({
    mutationFn: () =>
      (resetDraft ?? ((id, actor, version) => getCasesApi().resetDraft(id, actor, version)))(
        caseId,
        undefined,
        caseData.review_draft?.draft_version ?? 0,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.case(caseId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.caseTrace(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.casesAll() });
    },
  });
  const addClarificationMutation = useMutation({
    mutationFn: (body: AddClarificationRequest) =>
      (addClarification ?? ((id, payload) => getCasesApi().addClarification(id, payload)))(
        caseId,
        body,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.case(caseId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.caseTrace(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.casesAll() });
      setClarificationText("");
      setSelectedRevisionNumber(null);
      setIdempotencyKey(`clarif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      setConfirmReanalysisOpen(false);
    },
  });
  const traceQuery = useQuery({
    queryKey: queryKeys.caseTrace(caseId),
    queryFn: () => (loadTrace ?? getCasesApi().trace)(caseId),
    enabled: caseQuery.isSuccess,
    retry: false,
  });

  if (caseQuery.isPending) {
    return <p role="status">Loading case</p>;
  }

  if (caseQuery.error instanceof ApiError && caseQuery.error.status === 404) {
    return (
      <Callout tone="danger" title="Case not found">
        <p>This case ID is not in the API.</p>
        <Link to="/cases/new">Create a new case</Link>
      </Callout>
    );
  }

  if (caseQuery.error) {
    return (
      <Callout tone="danger" title="The case could not be loaded">
        <p>{caseQuery.error.message}</p>
        <p>Retry against {getApiBaseUrl()}.</p>
        <Button onClick={() => void caseQuery.refetch()}>Retry</Button>
      </Callout>
    );
  }

  const caseData = caseQuery.data;

  async function copy(value: string) {
    await (copyText ?? ((text: string) => navigator.clipboard.writeText(text)))(value);
  }

  async function handleCopyReply(value: string) {
    try {
      await (copyText ?? ((text: string) => navigator.clipboard.writeText(text)))(value);
      setCopyReplyState("success");
      setCopyReplyError(null);
      setTimeout(() => {
        setCopyReplyState((current) => (current === "success" ? "idle" : current));
      }, 3000);
    } catch (error) {
      setCopyReplyState("error");
      setCopyReplyError(
        error instanceof Error
          ? error.message
          : "Could not copy automatically. Please select and copy text manually.",
      );
    }
  }

  const latestEvent = traceQuery.data?.events.at(-1);
  const events = traceQuery.data?.events ?? [];
  const policyEvent = firstEventOfType(events, "human_review_requested");
  const executionEvent = firstEventOfType(events, "action_executed");

  const revisions = caseData.revisions ?? [];
  const currentRevisionNumber = caseData.current_revision ?? revisions.length ?? 1;
  const activeRevisionNumber = selectedRevisionNumber ?? currentRevisionNumber;
  const activeRevision = revisions.find((r) => r.revision_number === activeRevisionNumber);
  const isViewingArchivedRevision =
    selectedRevisionNumber !== null && selectedRevisionNumber !== currentRevisionNumber;
  const displayTriage = isViewingArchivedRevision && activeRevision ? activeRevision.triage : caseData.triage;
  const displayEvidence = isViewingArchivedRevision && activeRevision ? activeRevision.evidence : caseData.evidence;
  const displayBrief = isViewingArchivedRevision && activeRevision ? activeRevision.resolution_brief : caseData.resolution_brief;

  function handleClarificationSubmit(forceDiscardDraft = false) {
    if (!clarificationText.trim()) return;

    const hasDraft = Boolean(caseData.review_draft) || reviewDirty;
    if (hasDraft && !forceDiscardDraft) {
      setConfirmReanalysisOpen(true);
      return;
    }

    addClarificationMutation.mutate({
      text: clarificationText.trim(),
      author: clarificationAuthor.trim() || "requester",
      idempotency_key: idempotencyKey,
      discard_draft: true,
    });
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <Link to="/cases" className={styles.backLink}>
            ← Back to cases queue
          </Link>
          <h1>Case workspace</h1>
          <p className={styles.caseId}>{caseData.case_id}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.badges}>
            <Badge tone={caseData.status === "rejected" ? "danger" : caseData.status === "completed" ? "success" : "review"}>
              {statusLabel(caseData.status)}
            </Badge>
            <Badge>
              {displayTriage.priority}
              {isViewingArchivedRevision ? ` (rev ${activeRevisionNumber})` : ""}
            </Badge>
            <Badge tone="warning">{displayTriage.risk} risk</Badge>
            <p className={styles.aiChip} data-mode={caseData.fallback_reason ? "offline" : "live"}>
              <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
              {provenanceLabel(caseData)}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void copy(caseData.case_id)}
          >
            Copy case ID
          </Button>
          <Button variant="secondary" onClick={() => void caseQuery.refetch()}>
            Refresh
          </Button>
          {caseQuery.dataUpdatedAt > 0 ? (
            <p className={styles.fetched}>
              Last updated {new Date(caseQuery.dataUpdatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.rail} aria-label="Case workflow">
          <TaskRows items={workflowItems(caseData)} onSelect={scrollToSection} />
        </nav>
        <div className={styles.stack}>
          <Card as="section" id="request" tabIndex={-1} tone="request">
            <div className={styles.cardBannerInfo}>
              <User size={12} aria-hidden="true" />
              <span>Customer Request</span>
            </div>
            <SectionHeading icon={MessageSquareQuote}>Request</SectionHeading>
            <blockquote className={styles.quote}>{caseData.request_text}</blockquote>
            <div className={styles.triageMetaRow}>
              <span>{caseData.triage.category}</span>
              <span>·</span>
              <span>{caseData.triage.priority}</span>
              <span>·</span>
              <span>{caseData.triage.risk} risk</span>
              <span>·</span>
              <ConfidenceMeter score={caseData.triage.confidence} />
            </div>
          </Card>

          <Card as="section" id="clarifications" tabIndex={-1}>
            <div className={styles.cardBannerInfo}>
              <MessageSquareQuote size={12} aria-hidden="true" />
              <span>Clarifications & Context</span>
            </div>
            <SectionHeading icon={MessageSquareQuote}>
              Clarifications ({caseData.clarifications?.length ?? 0})
            </SectionHeading>

            {caseData.clarifications && caseData.clarifications.length > 0 ? (
              <div className={styles.clarificationsList}>
                {caseData.clarifications.map((c) => (
                  <div key={c.id} className={styles.clarificationItem}>
                    <div className={styles.clarificationHeader}>
                      <span className={styles.clarificationAuthor}>
                        {c.author === "requester" ? "Requester" : c.author}
                      </span>
                      <span className={styles.clarificationTime}>
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </div>
                    <blockquote className={styles.clarificationText}>{c.text}</blockquote>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>No supplementary clarifications added yet.</p>
            )}

            {caseData.status === "awaiting_human_review" ? (
              <div className={styles.clarificationForm}>
                <h3 className={styles.clarificationFormTitle}>Add clarification & re-analyze</h3>
                <div className={styles.formRow}>
                  <TextField
                    label="Author"
                    value={clarificationAuthor}
                    onChange={(e) => setClarificationAuthor(e.target.value)}
                    placeholder="requester"
                  />
                </div>
                <div className={styles.formRow}>
                  <TextArea
                    label="Clarification text"
                    value={clarificationText}
                    onChange={(e) => setClarificationText(e.target.value)}
                    placeholder="Provide additional details or response to missing information..."
                    rows={3}
                    maxLength={10000}
                  />
                  <div className={styles.charCounterRow}>
                    <span className={styles.charCounter}>
                      {clarificationText.length} / 10,000 characters
                    </span>
                  </div>
                </div>

                {addClarificationMutation.isError ? (
                  <div className={styles.clarificationErrorRow}>
                    <Callout tone="danger" title="Re-analysis failed" icon={AlertCircle}>
                      <p>
                        {addClarificationMutation.error?.message ||
                          "Could not add clarification and re-analyze."}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => handleClarificationSubmit(true)}
                        disabled={addClarificationMutation.isPending}
                      >
                        Retry
                      </Button>
                    </Callout>
                  </div>
                ) : null}

                <div className={styles.clarificationActionsRow}>
                  <Button
                    variant="primary"
                    onClick={() => handleClarificationSubmit(false)}
                    disabled={!clarificationText.trim() || addClarificationMutation.isPending}
                  >
                    {addClarificationMutation.isPending
                      ? "Re-analyzing..."
                      : "Add clarification & re-analyze"}
                  </Button>
                </div>
              </div>
            ) : (
              <Callout tone="info" title="Case settled">
                <p>
                  This case is in terminal state ({caseData.status}). Adding clarifications or
                  re-analyzing is not permitted.
                </p>
              </Callout>
            )}
          </Card>

          {revisions.length > 1 ? (
            <div className={styles.revisionHistoryBar}>
              <div className={styles.revisionTabsRow}>
                <span className={styles.revisionHistoryTitle}>
                  <History size={14} aria-hidden="true" style={{ display: "inline", marginRight: "4px" }} />
                  Analysis Revisions ({revisions.length}):
                </span>
                <div className={styles.revisionTabs}>
                  {revisions.map((rev) => {
                    const isSelected = rev.revision_number === activeRevisionNumber;
                    const isLatest = rev.revision_number === currentRevisionNumber;
                    return (
                      <button
                        key={rev.revision_number}
                        type="button"
                        className={`${styles.revisionTab} ${isSelected ? styles.revisionTabActive : ""}`}
                        onClick={() => setSelectedRevisionNumber(rev.revision_number)}
                        aria-pressed={isSelected}
                      >
                        Revision {rev.revision_number}
                        {rev.triggered_by === "intake" ? " (intake)" : " (clarification)"}
                        <Badge tone="neutral">{rev.triage.priority}</Badge>
                        {isLatest ? <span className={styles.latestBadge}>current</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeRevisionNumber > 1 ? (
                <div className={styles.revisionCompareBanner}>
                  <Sparkles size={14} aria-hidden="true" />
                  <span>
                    Compared with Revision {activeRevisionNumber - 1}:
                    Priority:{" "}
                    <strong>
                      {revisions.find((r) => r.revision_number === activeRevisionNumber - 1)?.triage.priority ?? "—"}
                      {" → "}
                      {displayTriage.priority}
                    </strong>
                  </span>
                </div>
              ) : null}

              {isViewingArchivedRevision ? (
                <Callout tone="warning" title="Archived revision snapshot" icon={AlertCircle}>
                  <p>
                    Viewing past analysis snapshot for Revision {activeRevisionNumber}. This data is read-only.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedRevisionNumber(null)}
                  >
                    Return to current revision ({currentRevisionNumber})
                  </Button>
                </Callout>
              ) : null}
            </div>
          ) : null}

          <section className={styles.stack} id="review" tabIndex={-1}>
            <Card tone="facts">
              <div className={styles.cardBannerFacts}>
                <Sparkles size={12} aria-hidden="true" />
                <span>AI Extracted Facts</span>
              </div>
              <div className={styles.sectionHeaderWithAction}>
                <SectionHeading icon={User} mark="AI extracted">
                  Reported facts
                </SectionHeading>
                {caseData.status === "awaiting_human_review" ? (
                  <Button
                    variant="secondary"
                    className={styles.quickEditBtn}
                    onClick={() => scrollToSection("outcome")}
                    aria-label="Edit facts in review panel"
                  >
                    <Pencil size={13} aria-hidden="true" /> Edit facts
                  </Button>
                ) : null}
              </div>
              {displayBrief.requester_facts.length > 0 ? (
                <ul className={styles.list}>
                  {displayBrief.requester_facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              ) : (
                <p>No requester facts were stored for this case.</p>
              )}
            </Card>
            <Card tone="ai">
              <div className={styles.cardBannerAi}>
                <Sparkles size={12} aria-hidden="true" />
                <span>System Inferences</span>
              </div>
              <SectionHeading icon={Sparkles} mark={provenanceLabel(caseData)}>
                System inferences
              </SectionHeading>
              {displayBrief.inferences.length > 0 ? (
                <ul className={styles.list}>
                  {displayBrief.inferences.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No system inferences were stored for this case.</p>
              )}
            </Card>
            <Callout tone="warning" title="Still needed" icon={AlertCircle}>
              {displayBrief.missing_information.length > 0 ? (
                <ul className={styles.list}>
                  {displayBrief.missing_information.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No missing information was listed.</p>
              )}
            </Callout>
          </section>

          <section className={styles.stack} id="evidence" tabIndex={-1}>
            <SectionHeading icon={BookOpen}>Evidence</SectionHeading>
            {displayEvidence.length === 0 ? (
              <p>No fixture evidence was stored for this case.</p>
            ) : null}
            {displayEvidence.map((item) => {
              const toolEvent = toolEventForSource(events, item.source_id);
              return (
                <div key={item.source_id}>
                  <ContextCard
                    sourceType={item.source_type}
                    sourceId={item.source_id}
                    excerpt={item.excerpt}
                    toolName={item.tool_name}
                    observedAt={item.observed_at}
                    retrievalReason={`Returned by ${item.tool_name}`}
                    onCopy={copy}
                  />
                  <p>
                    <a href={toolEvent ? `#${eventAnchorId(toolEvent)}` : "#trace"}>
                      View {item.source_id} in trace
                    </a>
                  </p>
                </div>
              );
            })}
          </section>

          <Card
            as="section"
            id="brief"
            tabIndex={-1}
            tone={caseData.status === "completed" ? "human" : caseData.status === "rejected" ? "request" : "ai"}
          >
            <div
              className={
                caseData.status === "completed"
                  ? styles.cardBannerApproved
                  : caseData.status === "rejected"
                    ? styles.cardBannerRejected
                    : styles.cardBannerAi
              }
            >
              {caseData.status === "completed" ? (
                <>
                  <ShieldCheck size={12} aria-hidden="true" />
                  <span>Human Approved Resolution</span>
                </>
              ) : caseData.status === "rejected" ? (
                <>
                  <ShieldAlert size={12} aria-hidden="true" />
                  <span>Proposal Rejected · Actions Blocked</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} aria-hidden="true" />
                  <span>AI Proposed Resolution Brief</span>
                </>
              )}
            </div>
            <div className={styles.sectionHeaderWithAction}>
              <SectionHeading
                icon={PenLine}
                mark={
                  caseData.status === "completed"
                    ? caseData.review?.edits?.reply_draft
                      ? "Operator edited & approved"
                      : "Operator approved"
                    : caseData.status === "rejected"
                      ? "Proposal rejected"
                      : "AI draft"
                }
              >
                Resolution brief
              </SectionHeading>
              {caseData.status === "awaiting_human_review" ? (
                <Button
                  variant="secondary"
                  className={styles.quickEditBtn}
                  onClick={() => scrollToSection("outcome")}
                  aria-label="Open reply edit controls"
                >
                  <Pencil size={13} aria-hidden="true" /> Edit reply draft
                </Button>
              ) : null}
            </div>

            <div className={styles.briefContent}>
              <div className={styles.replySection}>
                <h3 className={styles.briefSubheading}>Customer-facing reply</h3>
                {displayBrief.reply_draft?.trim() ? (
                  <>
                    <blockquote className={styles.replyBlockquote}>
                      {displayBrief.reply_draft}
                    </blockquote>
                    <div className={styles.replyActionsRow}>
                      <Button
                        variant="secondary"
                        onClick={() => void handleCopyReply(displayBrief.reply_draft)}
                        aria-label="Copy customer reply"
                      >
                        {copyReplyState === "success" ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <Copy size={13} aria-hidden="true" />
                        )}
                        Copy reply
                      </Button>
                      {copyReplyState === "success" ? (
                        <span role="status" className={styles.copyStatusSuccess}>
                          Reply copied to clipboard
                        </span>
                      ) : null}
                      {copyReplyState === "error" ? (
                        <span role="alert" className={styles.copyStatusError}>
                          {copyReplyError || "Could not copy automatically. Please select and copy text manually."}
                        </span>
                      ) : null}
                    </div>
                    <p className={styles.disclaimerText}>
                      Decision on proposed reply — not automatically sent to customer.
                    </p>
                  </>
                ) : (
                  <p className={styles.emptyText}>No customer reply recorded for this case.</p>
                )}
              </div>

              <div className={styles.actionsSection}>
                <h3 className={styles.briefSubheading}>Proposed actions</h3>
                {displayBrief.proposed_actions.length > 0 ? (
                  <div className={styles.proposedActionsList}>
                    {displayBrief.proposed_actions.map((action) => (
                      <div key={action.id} className={styles.actionCard}>
                        <div className={styles.actionCardHeader}>
                          <span className={styles.actionKind}>{action.kind}</span>
                          <div className={styles.actionBadges}>
                            <Badge tone={action.risk === "high" ? "warning" : "neutral"}>
                              {action.risk} risk
                            </Badge>
                            <Badge tone={action.approval_required ? "review" : "neutral"}>
                              {action.approval_required ? "Approval required" : "No approval"}
                            </Badge>
                            <Badge
                              tone={
                                action.state === "executed"
                                  ? "success"
                                  : action.state === "rejected"
                                    ? "danger"
                                    : "review"
                              }
                            >
                              {action.state}
                            </Badge>
                          </div>
                        </div>
                        <p className={styles.actionPreview}>{action.payload_preview}</p>
                        {action.execution_result ? (
                          <div className={styles.mockExecutionBox}>
                            <p className={styles.mockRefText}>
                              Mock reference: <strong>{action.execution_result.external_reference ?? "unavailable"}</strong>
                              {action.execution_result.executed_at
                                ? ` · recorded at ${action.execution_result.executed_at}`
                                : null}
                            </p>
                            <p className={styles.mockDisclaimer}>
                              Mock execution only. No real external incident was created.
                            </p>
                          </div>
                        ) : action.state === "rejected" ? (
                          <p className={styles.rejectedDisclaimer}>
                            Action blocked by policy gate. No incident was created.
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyText}>No actions were proposed.</p>
                )}
              </div>
            </div>
          </Card>

          <section id="outcome" tabIndex={-1}>
            <ReviewPanel
              caseData={caseData}
              busy={reviewMutation.isPending}
              error={reviewMutation.error?.message}
              conflict={
                reviewMutation.error instanceof ApiError && reviewMutation.error.status === 409
              }
              policyTraceHref={policyEvent ? `#${eventAnchorId(policyEvent)}` : "#trace"}
              executionTraceHref={executionEvent ? `#${eventAnchorId(executionEvent)}` : "#trace"}
              onReload={() => void caseQuery.refetch()}
              onSubmit={(body) => reviewMutation.mutate(body)}
              onSaveDraft={(body) => saveDraftMutation.mutate(body)}
              onResetDraft={() => resetDraftMutation.mutate()}
              onDirtyChange={(dirty) => setReviewDirty(dirty)}
              draftBusy={saveDraftMutation.isPending || resetDraftMutation.isPending}
              draftError={saveDraftMutation.error?.message ?? resetDraftMutation.error?.message}
              draftConflict={
                saveDraftMutation.error instanceof ApiError &&
                saveDraftMutation.error.status === 409
              }
            />
          </section>
        </div>
      </div>

      <Dialog
        open={confirmReanalysisOpen}
        busy={addClarificationMutation.isPending}
        title="Unsaved review draft detected"
        onClose={() => setConfirmReanalysisOpen(false)}
      >
        <p>
          You have unsaved edits in the review panel or a saved review draft. Re-analyzing with
          new clarification context will produce a new AI brief revision and reset the current draft
          so you can evaluate fresh conclusions.
        </p>
        <p>Do you want to proceed and discard the draft, or cancel to review your draft?</p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
          <Button variant="secondary" onClick={() => setConfirmReanalysisOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmReanalysisOpen(false);
              handleClarificationSubmit(true);
            }}
          >
            Discard draft & re-analyze
          </Button>
        </div>
      </Dialog>

      <details className={styles.trace} id="trace">
        <summary>
          Audit trail · {traceQuery.data?.events.length ?? 0} events
          {latestEvent ? ` · latest ${latestEvent.event_type}` : ""}
        </summary>
        <TraceTimeline
          events={traceQuery.data?.events}
          loading={traceQuery.isPending || (traceQuery.isFetching && !traceQuery.data)}
          error={traceQuery.error?.message}
          onRetry={() => void traceQuery.refetch()}
          onRefresh={() => void traceQuery.refetch()}
        />
      </details>
    </div>
  );
}
