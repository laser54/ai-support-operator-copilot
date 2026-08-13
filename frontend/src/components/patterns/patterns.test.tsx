import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "../../app/App";
import { ApprovalCard } from "../patterns/ApprovalCard";
import { ContextCard } from "../patterns/ContextCard";
import { FilterTable } from "../patterns/FilterTable";
import { RecommendationCard } from "../patterns/RecommendationCard";
import { TaskRows } from "../patterns/TaskRows";

describe("workflow patterns", () => {
  it("shows workflow row status as text plus an accessible name", () => {
    render(
      <TaskRows
        items={[
          { id: "request", label: "Request", status: "completed" },
          { id: "review", label: "Human review", status: "waiting" },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Request, completed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Human review, waiting" }),
    ).toBeInTheDocument();
  });

  it("keeps approve and reject equally labeled on the approval card", () => {
    render(
      <ApprovalCard
        title="Create mock incident"
        summary="Engineering incident draft. Mock-only side effect after approval."
        onApprove={() => undefined}
        onReject={() => undefined}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Approve and create mock incident" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject proposal" })).toBeEnabled();
    expect(screen.getByText(/cannot run until you approve/i)).toBeInTheDocument();
  });

  it("replaces confidence meters with evidence, policy, and uncertainty text", () => {
    render(
      <RecommendationCard
        title="Create incident"
        actionPreview="create_incident: portal auth 5xx"
        evidenceStrength="Three fixture sources agree on a post-release 5xx pattern."
        policyResult="Approval required. The API will not execute this action yet."
        uncertainty="First observed timestamp is still missing."
      />,
    );

    expect(screen.getByText(/Three fixture sources/)).toBeInTheDocument();
    expect(screen.getByText(/The API will not execute this action yet/)).toBeInTheDocument();
    expect(screen.getByText(/timestamp is still missing/)).toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it("keeps source IDs visible and marks synthetic fixtures", () => {
    render(
      <ContextCard
        sourceType="knowledge"
        sourceId="kb-auth-5xx-after-release"
        excerpt="Reset auth sessions after a 5xx release."
        toolName="search_knowledge"
        observedAt="2026-08-12T10:42:00Z"
        retrievalReason="Matched login HTTP 500 after update"
      />,
    );

    expect(screen.getByText("kb-auth-5xx-after-release")).toBeInTheDocument();
    expect(screen.getByText("Synthetic fixture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy source ID" })).toBeInTheDocument();
  });

  it("filters the trace without reordering remaining events", async () => {
    const user = userEvent.setup();
    render(
      <FilterTable
        events={[
          { id: "1", category: "workflow", label: "Case created" },
          { id: "2", category: "tools", label: "Knowledge searched" },
          { id: "3", category: "human", label: "Review recorded" },
          { id: "4", category: "execution", label: "Mock incident executed" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Human 1/ }));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Review recorded");
  });
});

describe("application shell", () => {
  it("renders workspace navigation without the retired component gallery", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New case" })).toHaveAttribute("href", "/cases/new");
    expect(screen.queryByRole("link", { name: "Component gallery" })).not.toBeInTheDocument();
  });
});
