import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { getApiBaseUrl, getCasesApi } from "../../api/runtime";
import type { CaseResponse, ReviewRequest, TraceResponse } from "../../api/types";
import { ContextCard } from "../../components/patterns/ContextCard";
import { LoadingState } from "../../components/patterns/LoadingState";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { TraceTimeline } from "../trace/TraceTimeline";
import { eventAnchorId, firstEventOfType, toolEventForSource } from "../trace/labels";
import { ReviewPanel } from "./ReviewPanel";
import { confidenceLabel, provenanceLabel, statusLabel, workflowItems } from "./status";
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
    },
  });
  const traceQuery = useQuery({
    queryKey: queryKeys.caseTrace(caseId),
    queryFn: () => (loadTrace ?? getCasesApi().trace)(caseId),
    enabled: caseQuery.isSuccess,
    retry: false,
  });

  if (caseQuery.isPending) {
    return <LoadingState label="Loading case" />;
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
  const latestEvent = traceQuery.data?.events.at(-1);
  const events = traceQuery.data?.events ?? [];
  const policyEvent = firstEventOfType(events, "human_review_requested");
  const executionEvent = firstEventOfType(events, "action_executed");

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
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
            <Badge tone="primary">{provenanceLabel(caseData.fallback_reason)}</Badge>
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
          <Card as="section" id="request" tabIndex={-1}>
            <h2>Request</h2>
            <blockquote className={styles.quote}>{caseData.request_text}</blockquote>
            <p>
              {caseData.triage.category} · {caseData.triage.priority} · {caseData.triage.risk} risk ·{" "}
              {confidenceLabel(caseData.triage.confidence)}
            </p>
          </Card>

          <section className={styles.stack} id="review" tabIndex={-1}>
            <Card>
              <h2>Reported facts</h2>
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
            <Card>
              <h2>System inferences</h2>
              <Badge>AI inference</Badge>
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
            <Callout tone="warning" title="Still needed">
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
            <h2>Evidence</h2>
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

          <Card as="section" id="brief" tabIndex={-1}>
            <h2>Resolution brief</h2>
            <p>Edit the customer-facing reply in Human review before you decide.</p>
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
        <Button variant="secondary" onClick={() => void traceQuery.refetch()}>
          Refresh trace
        </Button>
        <TraceTimeline
          events={traceQuery.data?.events}
          loading={traceQuery.isPending || (traceQuery.isFetching && !traceQuery.data)}
          error={traceQuery.error?.message}
          onRetry={() => void traceQuery.refetch()}
        />
      </details>
    </div>
  );
}
