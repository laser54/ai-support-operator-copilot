import type { AuditEvent } from "../../api/types";
import type { TraceFilterCategory } from "../../components/patterns/FilterTable";

const EVENT_LABELS: Record<string, string> = {
  case_created: "Case created",
  brief_built: "Brief built",
  human_review_requested: "Human review requested",
  review_recorded: "Review recorded",
  action_approved: "Action approved",
  action_rejected: "Action rejected",
  action_executed: "Mock incident executed",
};

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Knowledge searched",
  find_similar_cases: "Similar cases checked",
  check_service_status: "Service status checked",
};

export function eventLabel(event: AuditEvent): string {
  if (event.event_type === "tool_called") {
    return TOOL_LABELS[event.name] ?? event.name;
  }
  return EVENT_LABELS[event.event_type] ?? event.event_type;
}

export function eventCategory(event: AuditEvent): TraceFilterCategory {
  if (event.event_type === "tool_called") {
    return "tools";
  }
  if (event.event_type === "action_executed") {
    return "execution";
  }
  if (
    event.actor_type === "operator" ||
    event.event_type === "review_recorded" ||
    event.event_type === "action_approved" ||
    event.event_type === "action_rejected"
  ) {
    return "human";
  }
  return "workflow";
}

export function eventAnchorId(event: AuditEvent): string {
  return `event-${event.id}`;
}

export function toolEventForSource(events: AuditEvent[], sourceId: string): AuditEvent | undefined {
  return events.find(
    (event) => event.event_type === "tool_called" && event.output_summary.includes(sourceId),
  );
}

export function firstEventOfType(events: AuditEvent[], eventType: string): AuditEvent | undefined {
  return events.find((event) => event.event_type === eventType);
}
