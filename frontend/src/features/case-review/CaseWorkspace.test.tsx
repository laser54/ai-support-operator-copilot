import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { CaseResponse, ReviewRequest, TraceResponse } from "../../api/types";
import { CaseWorkspace } from "./CaseWorkspace";
import { sampleCase, sampleTrace, approvedTrace, rejectedTrace } from "./fixtures";

function renderWorkspace(options?: {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
  submitReview?: (caseId: string, body: ReviewRequest) => Promise<CaseResponse>;
  status?: CaseResponse["status"];
  copyText?: (value: string) => Promise<void>;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const loadCase =
    options?.loadCase ??
    vi.fn().mockResolvedValue({
      ...sampleCase,
      status: options?.status ?? sampleCase.status,
    });
  const loadTrace = options?.loadTrace ?? vi.fn().mockResolvedValue(sampleTrace);
  const submitReview = options?.submitReview;
  const copyText = options?.copyText ?? vi.fn().mockResolvedValue(undefined);
  return {
    loadCase,
    submitReview,
    copyText,
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/cases/${sampleCase.case_id}`]}>
          <Routes>
            <Route
              path="/cases/:caseId"
              element={
                <CaseWorkspace
                  loadCase={loadCase}
                  loadTrace={loadTrace}
                  submitReview={submitReview}
                  copyText={copyText}
                />
              }
            />
            <Route path="/cases/new" element={<p>New intake</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("CaseWorkspace", () => {
  it("renders request, facts, inferences, missing information, and evidence IDs", async () => {
    renderWorkspace();
    expect(await screen.findByText(/cannot sign in to the portal/i)).toBeInTheDocument();
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.getByText("Offline deterministic")).toBeInTheDocument();
    expect(screen.getByText(/86% confidence/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reported facts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "System inferences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still needed" })).toBeInTheDocument();
    expect(screen.getByText("kb-auth-5xx-after-release")).toBeInTheDocument();
    expect(screen.getByText("inc-104")).toBeInTheDocument();
    expect(screen.getByText("status-portal-auth-5xx")).toBeInTheDocument();
    expect(screen.getByText(/We have recorded the access incident/)).toBeInTheDocument();
    expect(screen.getByText(/cannot run until you approve/i)).toBeInTheDocument();
  });

  it("renders completed and rejected states distinctly", async () => {
    const { unmount } = renderWorkspace({ status: "completed" });
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    unmount();
    renderWorkspace({ status: "rejected" });
    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for review")).not.toBeInTheDocument();
  });

  it("shows a recovery path when the case is missing", async () => {
    renderWorkspace({
      loadCase: vi.fn().mockRejectedValue(new ApiError(404, "not_found", "case not found")),
    });
    expect(await screen.findByRole("heading", { name: "Case not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a new case" })).toHaveAttribute(
      "href",
      "/cases/new",
    );
  });

  it("shows the configured API origin when the case cannot be loaded", async () => {
    renderWorkspace({
      loadCase: vi.fn().mockRejectedValue(new Error("API unavailable")),
    });
    expect(await screen.findByText(/API unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/127\.0\.0\.1:8000/)).toBeInTheDocument();
  });

  it("copies the case ID and evidence source IDs", async () => {
    const { user, copyText } = renderWorkspace();
    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Copy case ID" }));
    expect(copyText).toHaveBeenCalledWith(sampleCase.case_id);
    await user.click(screen.getAllByRole("button", { name: "Copy source ID" })[0]);
    expect(copyText).toHaveBeenCalledWith("kb-auth-5xx-after-release");
  });

  it("submits edited values through the approve confirmation", async () => {
    const approved: CaseResponse = {
      ...sampleCase,
      status: "completed",
      triage: { ...sampleCase.triage, priority: "P2" },
      resolution_brief: {
        ...sampleCase.resolution_brief,
        reply_draft: "Engineering is investigating.",
        proposed_actions: [
          {
            ...sampleCase.resolution_brief.proposed_actions[0],
            state: "executed",
            execution_result: {
              external_reference: "MOCK-1",
              executed_at: "2026-08-12T11:00:00Z",
              message: "Mock incident stored once.",
            },
          },
        ],
      },
    };
    const submitReview = vi.fn().mockResolvedValue(approved);
    const { user } = renderWorkspace({ submitReview });
    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Edit analysis" }));
    await user.selectOptions(screen.getByLabelText("Priority"), "P2");
    await user.click(screen.getByRole("button", { name: "Edit reply" }));
    await user.clear(screen.getByLabelText("Reply draft"));
    await user.type(screen.getByLabelText("Reply draft"), "Engineering is investigating.");
    await user.click(screen.getByRole("button", { name: "Approve and create mock incident" }));
    expect(screen.getByRole("dialog", { name: "Approve and create mock incident" })).toHaveTextContent(
      "P2",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Engineering is investigating.");
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(submitReview).toHaveBeenCalledWith(
      sampleCase.case_id,
      expect.objectContaining({
        actor: "operator@example.test",
        decision: "approve",
        edits: expect.objectContaining({
          priority: "P2",
          reply_draft: "Engineering is investigating.",
        }),
      }),
    );
    expect(await screen.findByText(/MOCK-1/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve and create mock incident" }),
    ).not.toBeInTheDocument();
  });

  it("rejects without showing a mock incident", async () => {
    const rejected: CaseResponse = {
      ...sampleCase,
      status: "rejected",
      resolution_brief: {
        ...sampleCase.resolution_brief,
        proposed_actions: sampleCase.resolution_brief.proposed_actions.map((action) => ({
          ...action,
          state: "rejected",
        })),
      },
    };
    const submitReview = vi.fn().mockResolvedValue(rejected);
    const { user } = renderWorkspace({ submitReview });
    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Reject proposal" }));
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(submitReview).toHaveBeenCalledWith(
      sampleCase.case_id,
      expect.objectContaining({ decision: "reject" }),
    );
    expect(await screen.findByText(/no incident was created/i)).toBeInTheDocument();
    expect(screen.queryByText(/MOCK-/)).not.toBeInTheDocument();
  });

  it("resets unsaved local edits", async () => {
    const { user } = renderWorkspace();
    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Edit reply" }));
    await user.clear(screen.getByLabelText("Reply draft"));
    await user.type(screen.getByLabelText("Reply draft"), "Temporary draft");
    expect(screen.getByText(/unsaved local edits/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset edits" }));
    expect(screen.getByText(sampleCase.resolution_brief.reply_draft)).toBeInTheDocument();
    expect(screen.queryByText(/unsaved local edits/i)).not.toBeInTheDocument();
  });

  it("loads the trace independently and links evidence to events", async () => {
    renderWorkspace({ loadTrace: () => new Promise(() => undefined) });
    await screen.findByText("Waiting for review");
    expect(screen.getByText("Loading trace")).toBeInTheDocument();
  });

  it("links evidence and the policy gate into the ordered trace", async () => {
    renderWorkspace();
    await screen.findByText("Case created");
    expect(screen.getByRole("link", { name: "View kb-auth-5xx-after-release in trace" })).toHaveAttribute(
      "href",
      "#event-00000000-0000-4000-8000-000000000002",
    );
    expect(screen.getByRole("link", { name: "View policy gate in trace" })).toHaveAttribute(
      "href",
      "#event-00000000-0000-4000-8000-000000000006",
    );
  });

  it("retries a failed trace without replacing the case", async () => {
    const loadTrace = vi
      .fn()
      .mockRejectedValueOnce(new Error("Trace unavailable"))
      .mockResolvedValueOnce(sampleTrace);
    const { user } = renderWorkspace({ loadTrace });
    await screen.findByText("Waiting for review");
    expect(await screen.findByText("Trace unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry trace" }));
    expect(await screen.findByText("Case created")).toBeInTheDocument();
  });

  it("shows execution in the approved trace and omits it after rejection", async () => {
    const { unmount } = renderWorkspace({
      status: "completed",
      loadTrace: vi.fn().mockResolvedValue(approvedTrace),
    });
    expect(await screen.findByText("Mock incident executed")).toBeInTheDocument();
    unmount();
    renderWorkspace({
      status: "rejected",
      loadTrace: vi.fn().mockResolvedValue(rejectedTrace),
    });
    expect(await screen.findByText("Action rejected")).toBeInTheDocument();
    expect(screen.queryByText("Mock incident executed")).not.toBeInTheDocument();
  });
});
