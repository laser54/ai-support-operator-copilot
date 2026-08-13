import type { AuditEvent } from "../../api/types";
import { FilterTable } from "../../components/patterns/FilterTable";
import { Button } from "../../components/primitives/Button";
import { Callout } from "../../components/primitives/Callout";
import { eventAnchorId, eventCategory, eventLabel } from "./labels";
import styles from "./TraceTimeline.module.css";

export function TraceTimeline({
  events,
  loading,
  error,
  onRetry,
}: {
  events?: AuditEvent[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const rows = events?.map((event) => ({
    id: event.id,
    category: eventCategory(event),
    label: eventLabel(event),
    event,
  }));

  if (loading) {
    return <p>Loading trace</p>;
  }

  if (error) {
    return (
      <Callout tone="danger" title="The audit trail could not be loaded">
        <p>{error}</p>
        <Button onClick={onRetry}>Retry trace</Button>
      </Callout>
    );
  }

  if (!rows) {
    return null;
  }

  return (
    <FilterTable
      events={rows}
      renderEvent={(row) => {
        const event = row.event;
        return (
          <article className={styles.event} id={eventAnchorId(event)} tabIndex={-1}>
            <p className={styles.heading}>
              <span className={styles.sequence}>{event.sequence}.</span> {eventLabel(event)}
            </p>
            <p className={styles.meta}>
              {event.event_type} · {event.name} · {event.actor_type}
              {event.actor_id ? ` · ${event.actor_id}` : ""} · {event.timestamp}
            </p>
            {event.event_type === "tool_called" ? (
              <p className={styles.sources}>{event.output_summary}</p>
            ) : null}
            {event.actor_type === "operator" ? (
              <p className={styles.decision}>{event.output_summary}</p>
            ) : null}
            <details>
              <summary>Event details</summary>
              <p>Correlation ID {event.correlation_id}</p>
              <p>Input {event.input_summary}</p>
              <p>Output {event.output_summary}</p>
            </details>
          </article>
        );
      }}
    />
  );
}
