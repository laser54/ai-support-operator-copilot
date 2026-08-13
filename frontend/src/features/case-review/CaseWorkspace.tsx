import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";

import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { getCasesApi } from "../../api/runtime";
import type { CaseResponse, TraceResponse } from "../../api/types";
import { ContextCard } from "../../components/patterns/ContextCard";
import { LoadingState } from "../../components/patterns/LoadingState";
import { RecommendationCard } from "../../components/patterns/RecommendationCard";
import { TaskRows } from "../../components/patterns/TaskRows";
import { Badge } from "../../components/primitives/Badge";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { Card } from "../../components/primitives/Card";
import { confidenceLabel, provenanceLabel, statusLabel, workflowItems } from "./status";
import styles from "./CaseWorkspace.module.css";

type Loaders = {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
  copyText?: (value: string) => Promise<void>;
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById(id)?.focus();
}

export function CaseWorkspace({ loadCase, loadTrace, copyText }: Loaders) {
  const { caseId = "" } = useParams();
  const caseQuery = useQuery({
    queryKey: queryKeys.case(caseId),
    queryFn: () => (loadCase ?? getCasesApi().get)(caseId),
    enabled: caseId.length > 0,
    retry: false,
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
        <Button onClick={() => void caseQuery.refetch()}>Retry</Button>
      </Callout>
    );
  }

  const caseData = caseQuery.data;
  async function copy(value: string) {
    await (copyText ?? ((text: string) => navigator.clipboard.writeText(text)))(value);
  }
  const incident = caseData.resolution_brief.proposed_actions.find(
    (action) => action.kind === "create_incident",
  );
  const latestEvent = traceQuery.data?.events.at(-1);

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
              <ul className={styles.list}>
                {caseData.resolution_brief.requester_facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2>System inferences</h2>
              <Badge>AI inference</Badge>
              <ul className={styles.list}>
                {caseData.resolution_brief.inferences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
            <Callout tone="warning" title="Still needed">
              <ul className={styles.list}>
                {caseData.resolution_brief.missing_information.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Callout>
          </section>

          <section className={styles.stack} id="evidence" tabIndex={-1}>
            <h2>Evidence</h2>
            {caseData.evidence.map((item) => (
              <ContextCard
                key={item.source_id}
                sourceType={item.source_type}
                sourceId={item.source_id}
                excerpt={item.excerpt}
                toolName={item.tool_name}
                observedAt={item.observed_at}
                retrievalReason={`Returned by ${item.tool_name}`}
                onCopy={copy}
              />
            ))}
          </section>

          <Card as="section" id="brief" tabIndex={-1}>
            <h2>Resolution brief</h2>
            <p>{caseData.resolution_brief.reply_draft}</p>
          </Card>

          <section id="outcome" tabIndex={-1}>
            {incident ? (
              <RecommendationCard
                title="Proposed incident action"
                actionPreview={`${incident.payload_preview} (${incident.state})`}
                evidenceStrength={`${caseData.evidence.length} fixture sources support this recommendation.`}
                policyResult={
                  incident.approval_required
                    ? "This action cannot run until you approve it."
                    : `Action state: ${incident.state}`
                }
                uncertainty={caseData.resolution_brief.missing_information.join("; ") || "No listed gaps."}
              />
            ) : null}
          </section>
        </div>
      </div>

      <details className={styles.trace}>
        <summary>
          Audit trail · {traceQuery.data?.events.length ?? 0} events
          {latestEvent ? ` · latest ${latestEvent.event_type}` : ""}
        </summary>
        {traceQuery.isPending ? <p>Loading trace</p> : null}
        {traceQuery.error ? <p>{traceQuery.error.message}</p> : null}
        {traceQuery.data ? (
          <ol>
            {traceQuery.data.events.map((event) => (
              <li key={event.id}>
                {event.sequence}. {event.event_type} · {event.name}
              </li>
            ))}
          </ol>
        ) : null}
      </details>
    </div>
  );
}
