import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
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
import type { CaseResponse, ReviewRequest, TraceResponse } from "../../api/types";
import { ContextCard } from "../../components/patterns/ContextCard";
import { ConfidenceMeter } from "../../components/patterns/ConfidenceMeter";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { SectionHeading } from "../../components/primitives/SectionHeading";
import { TraceTimeline } from "../trace/TraceTimeline";
import { eventAnchorId, firstEventOfType, toolEventForSource } from "../trace/labels";
import { ReviewPanel } from "./ReviewPanel";
import { provenanceLabel, statusLabel, workflowItems } from "./status";
import styles from "./CaseWorkspace.module.css";

type Loaders = {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
  submitReview?: (caseId: string, body: ReviewRequest) => Promise<CaseResponse>;
  copyText?: (value: string) => Promise<void>;
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById(id)?.focus();
}

export function CaseWorkspace({ loadCase, loadTrace, submitReview, copyText }: Loaders) {
  const { caseId = "" } = useParams();
  const [copyReplyState, setCopyReplyState] = useState<"idle" | "success" | "error">("idle");
  const [copyReplyError, setCopyReplyError] = useState<string | null>(null);
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
            <Badge>{caseData.triage.priority}</Badge>
            <Badge tone="warning">{caseData.triage.risk} risk</Badge>
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
              {caseData.resolution_brief.requester_facts.length > 0 ? (
                <ul className={styles.list}>
                  {caseData.resolution_brief.requester_facts.map((fact) => (
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
              {caseData.resolution_brief.inferences.length > 0 ? (
                <ul className={styles.list}>
                  {caseData.resolution_brief.inferences.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No system inferences were stored for this case.</p>
              )}
            </Card>
            <Callout tone="warning" title="Still needed" icon={AlertCircle}>
              {caseData.resolution_brief.missing_information.length > 0 ? (
                <ul className={styles.list}>
                  {caseData.resolution_brief.missing_information.map((item) => (
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
            {caseData.evidence.length === 0 ? (
              <p>No fixture evidence was stored for this case.</p>
            ) : null}
            {caseData.evidence.map((item) => {
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
                {caseData.resolution_brief.reply_draft?.trim() ? (
                  <>
                    <blockquote className={styles.replyBlockquote}>
                      {caseData.resolution_brief.reply_draft}
                    </blockquote>
                    <div className={styles.replyActionsRow}>
                      <Button
                        variant="secondary"
                        onClick={() => void handleCopyReply(caseData.resolution_brief.reply_draft)}
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
                {caseData.resolution_brief.proposed_actions.length > 0 ? (
                  <div className={styles.proposedActionsList}>
                    {caseData.resolution_brief.proposed_actions.map((action) => (
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
            />
          </section>
        </div>
      </div>

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
