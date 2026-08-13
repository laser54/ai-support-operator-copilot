import type { CaseResponse, CaseStatus } from "../../api/types";
import type { TaskRowItem } from "../../components/patterns/TaskRows";

export function statusLabel(status: CaseStatus): string {
  if (status === "awaiting_human_review") {
    return "Waiting for review";
  }
  if (status === "completed") {
    return "Completed";
  }
  if (status === "rejected") {
    return "Rejected";
  }
  return "Received";
}

export function provenanceLabel(fallbackReason: string | null): string {
  return fallbackReason ? "Offline deterministic" : "Provider-backed";
}

export function workflowItems(caseData: CaseResponse): TaskRowItem[] {
  const settled = caseData.status === "completed" || caseData.status === "rejected";
  const outcomeStatus =
    caseData.status === "rejected" ? "failed" : settled ? "completed" : "waiting";
  return [
    { id: "request", label: "Request", status: "completed" },
    { id: "evidence", label: "Evidence", status: "completed" },
    { id: "brief", label: "Brief", status: "completed" },
    {
      id: "review",
      label: "Human review",
      status: settled ? "completed" : "waiting",
    },
    { id: "outcome", label: "Outcome", status: outcomeStatus },
  ];
}

export function confidenceLabel(confidence: number): string {
  return `${Math.round(confidence * 100)}% confidence`;
}
