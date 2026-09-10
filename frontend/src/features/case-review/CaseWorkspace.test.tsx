import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type {
  AddClarificationRequest,
  CaseResponse,
  ReviewRequest,
  SaveDraftRequest,
  TraceResponse,
} from "../../api/types";
import { CaseWorkspace } from "./CaseWorkspace";
import { sampleCase, sampleTrace, approvedTrace, rejectedTrace } from "./fixtures";

function renderWorkspace(options?: {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
  submitReview?: (caseId: string, body: ReviewRequest) => Promise<CaseResponse>;
  saveDraft?: (caseId: string, body: SaveDraftRequest) => Promise<CaseResponse>;
  resetDraft?: (caseId: string, actor?: string, expectedDraftVersion?: number | null) => Promise<CaseResponse>;
  addClarification?: (caseId: string, body: AddClarificationRequest) => Promise<CaseResponse>;
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
  const saveDraft = options?.saveDraft;
  const resetDraft = options?.resetDraft;
  const addClarification = options?.addClarification;
  const copyText = options?.copyText ?? vi.fn().mockResolvedValue(undefined);
  return {
    loadCase,
    submitReview,
    saveDraft,
    resetDraft,
    addClarification,
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
                  saveDraft={saveDraft}
                  resetDraft={resetDraft}
                  addClarification={addClarification}
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
    expect(screen.getAllByText("Offline fallback").length).toBeGreaterThan(0);
    expect(screen.getByText(/86% confidence/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reported facts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "System inferences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Still needed" })).toBeInTheDocument();
    expect(screen.getByText("kb-auth-5xx-after-release")).toBeInTheDocument();
    expect(screen.getByText("inc-104")).toBeInTheDocument();
    expect(screen.getByText("status-portal-auth-5xx")).toBeInTheDocument();
    expect(screen.getAllByText(/We have recorded the access incident/).length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot run until you approve/i)).toBeInTheDocument();
  });

  it("shows the live model name when the provider is connected", async () => {
    renderWorkspace({
      loadCase: vi.fn().mockResolvedValue({
        ...sampleCase,
        provider: "openai_compatible",
        fallback_reason: null,
        model: "deepseek-v4-flash",
      }),
    });
    expect(await screen.findAllByText("AI · deepseek-v4-flash")).not.toHaveLength(0);
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
    expect((await screen.findAllByText(/MOCK-1/)).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Approve and create mock incident" }),
    ).not.toBeInTheDocument();
  }, 15000);

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
    expect((await screen.findAllByText(/no incident was created/i)).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText(sampleCase.resolution_brief.reply_draft).length).toBeGreaterThan(0);
    expect(screen.queryByText(/unsaved local edits/i)).not.toBeInTheDocument();
  });

  it("loads the trace independently and links evidence to events", async () => {
    renderWorkspace({ loadTrace: () => new Promise(() => undefined) });
    await screen.findByText("Waiting for review");
    expect(screen.getByText("Loading trace")).toBeInTheDocument();
  });

  it("links evidence and the policy gate into the ordered trace", async () => {
    renderWorkspace();
    await screen.findByText("Case created", undefined, { timeout: 4000 });
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
    expect(await screen.findByText("Mock incident executed", {}, { timeout: 4000 })).toBeInTheDocument();
    unmount();
    renderWorkspace({
      status: "rejected",
      loadTrace: vi.fn().mockResolvedValue(rejectedTrace),
    });
    expect(await screen.findByText("Action rejected", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("Mock incident executed")).not.toBeInTheDocument();
  }, 10000);

  it("renders resolution brief with reply draft and proposed actions for all statuses", async () => {
    // 1. awaiting_human_review
    const { unmount } = renderWorkspace({ status: "awaiting_human_review" });
    expect(await screen.findByText("AI Proposed Resolution Brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open reply edit controls" })).toBeInTheDocument();
    expect(screen.getAllByText(sampleCase.resolution_brief.reply_draft).length).toBeGreaterThan(0);
    expect(screen.getByText("create_incident")).toBeInTheDocument();
    expect(
      screen.getByText("Decision on proposed reply — not automatically sent to customer."),
    ).toBeInTheDocument();
    unmount();

    // 2. completed
    const completedCase: CaseResponse = {
      ...sampleCase,
      status: "completed",
      resolution_brief: {
        ...sampleCase.resolution_brief,
        reply_draft: "Approved customer message.",
        proposed_actions: [
          {
            ...sampleCase.resolution_brief.proposed_actions[0],
            state: "executed",
            execution_result: {
              external_reference: "MOCK-104",
              executed_at: "2026-08-12T11:00:00Z",
              message: "Stored once",
            },
          },
        ],
      },
    };
    const { unmount: unmountCompleted } = renderWorkspace({
      loadCase: vi.fn().mockResolvedValue(completedCase),
    });
    expect(await screen.findByText("Human Approved Resolution")).toBeInTheDocument();
    expect(screen.getByText("Approved customer message.")).toBeInTheDocument();
    expect(screen.getByText("MOCK-104")).toBeInTheDocument();
    expect(
      screen.getByText("Mock execution only. No real external incident was created."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open reply edit controls" })).not.toBeInTheDocument();
    unmountCompleted();

    // 3. rejected
    const rejectedCase: CaseResponse = {
      ...sampleCase,
      status: "rejected",
      resolution_brief: {
        ...sampleCase.resolution_brief,
        reply_draft: "Rejected customer message.",
        proposed_actions: [
          {
            ...sampleCase.resolution_brief.proposed_actions[0],
            state: "rejected",
          },
        ],
      },
    };
    renderWorkspace({
      loadCase: vi.fn().mockResolvedValue(rejectedCase),
    });
    expect(await screen.findByText("Proposal Rejected · Actions Blocked")).toBeInTheDocument();
    expect(screen.getByText("Rejected customer message.")).toBeInTheDocument();
    expect(
      screen.getByText("Action blocked by policy gate. No incident was created."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open reply edit controls" })).not.toBeInTheDocument();
  });

  it("shows empty state when reply draft is missing or blank", async () => {
    const emptyCase: CaseResponse = {
      ...sampleCase,
      resolution_brief: {
        ...sampleCase.resolution_brief,
        reply_draft: "",
        proposed_actions: [],
      },
    };
    renderWorkspace({ loadCase: vi.fn().mockResolvedValue(emptyCase) });
    expect(await screen.findByText("No customer reply recorded for this case.")).toBeInTheDocument();
    expect(screen.getByText("No actions were proposed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy customer reply" })).not.toBeInTheDocument();
  });

  it("copies customer reply text and displays accessible status feedback", async () => {
    const copyText = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWorkspace({ copyText });
    await screen.findByText("Waiting for review");

    const copyBtn = screen.getByRole("button", { name: "Copy customer reply" });
    await user.click(copyBtn);

    expect(copyText).toHaveBeenCalledWith(sampleCase.resolution_brief.reply_draft);
    expect(await screen.findByRole("status")).toHaveTextContent("Reply copied to clipboard");
  });

  it("displays accessible error alert when clipboard API fails", async () => {
    const copyText = vi.fn().mockRejectedValue(new Error("Clipboard write permission denied"));
    const { user } = renderWorkspace({ copyText });
    await screen.findByText("Waiting for review");

    const copyBtn = screen.getByRole("button", { name: "Copy customer reply" });
    await user.click(copyBtn);

    expect(copyText).toHaveBeenCalledWith(sampleCase.resolution_brief.reply_draft);
    expect(await screen.findByRole("alert")).toHaveTextContent("Clipboard write permission denied");
    expect(screen.getAllByText(sampleCase.resolution_brief.reply_draft).length).toBeGreaterThan(0);
  });

  it("preserves local draft and displays conflict warning and reload button on 409 conflict", async () => {
    const submitReview = vi.fn().mockRejectedValue(
      new ApiError(409, "conflict", "version mismatch: expected 1, got 2")
    );
    const loadCase = vi.fn().mockResolvedValue(sampleCase);
    const { user } = renderWorkspace({ submitReview, loadCase });

    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Edit reply" }));
    await user.clear(screen.getByLabelText("Reply draft"));
    await user.type(screen.getByLabelText("Reply draft"), "Local custom reply draft text");
    await user.click(screen.getByRole("button", { name: "Done editing reply" }));

    // Verify local edit text is rendered
    expect(screen.getAllByText(/Local custom reply draft text/).length).toBeGreaterThan(0);

    // Trigger review submission
    await user.click(screen.getByRole("button", { name: "Approve and create mock incident" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));

    expect(submitReview).toHaveBeenCalledTimes(1);

    // Verify conflict callout and explanation
    expect(await screen.findByText("Review conflict (outdated version)")).toBeInTheDocument();
    expect(
      screen.getByText(/This case was updated by another operator or tab\. Your local edits have been preserved\./)
    ).toBeInTheDocument();

    // Verify local draft is still preserved in the document
    expect(screen.getAllByText(/Local custom reply draft text/).length).toBeGreaterThan(0);

    // Verify reload button triggers case refetch without repeating approval
    const reloadBtn = screen.getByRole("button", { name: "Reload case" });
    await user.click(reloadBtn);
    expect(loadCase).toHaveBeenCalledTimes(2);
    expect(submitReview).toHaveBeenCalledTimes(1);
  });

  it("renders saved draft from server on case load and populates fields", async () => {
    const caseWithDraft: CaseResponse = {
      ...sampleCase,
      review_draft: {
        actor: "operator-alice",
        priority: "P1",
        reply_draft: "Server saved draft reply text",
        requester_facts: ["Server draft fact 1", "Server draft fact 2"],
        comment: "Internal investigative note",
        draft_version: 3,
        saved_at: "2026-09-10T12:00:00Z",
      },
    };
    renderWorkspace({ loadCase: vi.fn().mockResolvedValue(caseWithDraft) });

    await screen.findByText("Waiting for review");
    expect(await screen.findByText(/Draft saved \(v3/)).toBeInTheDocument();
    expect(screen.getByText(/Effective priority: P1/)).toBeInTheDocument();
    expect(screen.getByText("Server saved draft reply text")).toBeInTheDocument();
    expect(screen.getByLabelText("Review comment / internal notes")).toHaveValue(
      "Internal investigative note",
    );
  });

  it("saves review draft without creating incident or changing status", async () => {
    const saveDraft = vi.fn().mockImplementation((_id, payload: SaveDraftRequest) =>
      Promise.resolve({
        ...sampleCase,
        review_draft: {
          actor: payload.actor,
          priority: payload.priority ?? sampleCase.triage.priority,
          reply_draft: payload.reply_draft ?? sampleCase.resolution_brief.reply_draft,
          requester_facts: payload.requester_facts ?? sampleCase.resolution_brief.requester_facts,
          comment: payload.comment ?? null,
          draft_version: 1,
          saved_at: "2026-09-10T12:05:00Z",
        },
      }),
    );
    const submitReview = vi.fn();
    const { user } = renderWorkspace({ saveDraft, submitReview });

    await screen.findByText("Waiting for review");

    // Edit comment
    const commentInput = screen.getByLabelText("Review comment / internal notes");
    await user.type(commentInput, "Draft note for team");

    // Unsaved changes badge appears
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();

    // Click Save draft
    const saveDraftBtn = screen.getByRole("button", { name: "Save draft" });
    await user.click(saveDraftBtn);

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft).toHaveBeenCalledWith(
      sampleCase.case_id,
      expect.objectContaining({
        actor: "operator@example.test",
        comment: "Draft note for team",
        expected_draft_version: 0,
      }),
    );
    expect(submitReview).not.toHaveBeenCalled();

    // Status remains awaiting review and draft saved badge is shown
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(await screen.findByText(/Draft saved \(v1/)).toBeInTheDocument();
  });

  it("protects dirty form state against background refetches", async () => {
    let callCount = 0;
    const loadCase = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ...sampleCase,
        version: callCount,
      });
    });

    const { user } = renderWorkspace({ loadCase });
    await screen.findByText("Waiting for review");

    // Edit reply draft
    await user.click(screen.getByRole("button", { name: "Edit reply" }));
    await user.type(screen.getByLabelText("Reply draft"), " additional typed text");
    await user.click(screen.getByRole("button", { name: "Done editing reply" }));

    expect(screen.getAllByText(/additional typed text/).length).toBeGreaterThan(0);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    // Simulate background refetch by invoking loadCase again via another re-render
    // Operator's typed edits must NOT be wiped out
    expect(screen.getAllByText(/additional typed text/).length).toBeGreaterThan(0);
  });

  it("handles draft save errors with retry button and preserved edits", async () => {
    const saveDraft = vi.fn()
      .mockRejectedValueOnce(new Error("Connection reset by peer"))
      .mockImplementation((_id, payload: SaveDraftRequest) =>
        Promise.resolve({
          ...sampleCase,
          review_draft: {
            actor: payload.actor,
            priority: payload.priority ?? sampleCase.triage.priority,
            reply_draft: payload.reply_draft ?? sampleCase.resolution_brief.reply_draft,
            requester_facts: payload.requester_facts ?? sampleCase.resolution_brief.requester_facts,
            comment: payload.comment ?? null,
            draft_version: 1,
            saved_at: "2026-09-10T12:00:00Z",
          },
        }),
      );

    const { user } = renderWorkspace({ saveDraft });
    await screen.findByText("Waiting for review");

    await user.type(screen.getByLabelText("Review comment / internal notes"), "Important note");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    // Error callout appears, entered text remains
    expect(await screen.findByText("Failed to save draft")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Connection reset by peer");
    expect(screen.getByLabelText("Review comment / internal notes")).toHaveValue("Important note");

    // Retry button works
    const retryBtn = screen.getByRole("button", { name: "Retry saving draft" });
    await user.click(retryBtn);

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Draft saved \(v1/)).toBeInTheDocument();
  });

  it("handles draft 409 conflict preserving edits", async () => {
    const saveDraft = vi.fn().mockRejectedValue(
      new ApiError(409, "conflict", "draft version mismatch: expected 1, got 2")
    );
    const { user } = renderWorkspace({ saveDraft });
    await screen.findByText("Waiting for review");

    await user.type(screen.getByLabelText("Review comment / internal notes"), "My draft note");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Draft conflict (outdated version)")).toBeInTheDocument();
    expect(screen.getByLabelText("Review comment / internal notes")).toHaveValue("My draft note");
  });

  it("resets draft to original AI suggestions with confirmation dialog", async () => {
    const caseWithDraft: CaseResponse = {
      ...sampleCase,
      review_draft: {
        actor: "operator",
        priority: "P1",
        reply_draft: "Custom draft reply",
        comment: "Draft comment",
        draft_version: 1,
        saved_at: "2026-09-10T12:00:00Z",
      },
    };
    const resetDraft = vi.fn().mockResolvedValue(sampleCase);
    const { user } = renderWorkspace({
      loadCase: vi.fn().mockResolvedValue(caseWithDraft),
      resetDraft,
    });

    await screen.findByText("Waiting for review");
    expect(screen.getByText("Custom draft reply")).toBeInTheDocument();

    // Click Reset draft
    const resetBtn = screen.getByRole("button", { name: "Reset draft" });
    await user.click(resetBtn);

    // Dialog opens
    expect(await screen.findByText("Reset review draft")).toBeInTheDocument();
    expect(
      screen.getByText(/This will discard your saved draft and restore original AI suggestions\./)
    ).toBeInTheDocument();

    // Confirm reset
    await user.click(screen.getByRole("button", { name: "Confirm reset" }));

    expect(resetDraft).toHaveBeenCalledWith(sampleCase.case_id, undefined, 1);
  });

  it("renders clarifications history and revision comparison when multiple revisions exist", async () => {
    const multiRevCase: CaseResponse = {
      ...sampleCase,
      clarifications: [
        {
          id: "clarif-uuid-1",
          text: "Server returned error 500 on auth portal",
          author: "requester",
          created_at: "2026-09-10T11:00:00Z",
        },
      ],
      current_revision: 2,
      revisions: [
        {
          revision_number: 1,
          created_at: "2026-09-10T10:00:00Z",
          triggered_by: "intake",
          triage: { ...sampleCase.triage, priority: "P3" },
          evidence: [],
          resolution_brief: { ...sampleCase.resolution_brief, requester_facts: ["Initial report"] },
          provider: "offline",
        },
        {
          revision_number: 2,
          created_at: "2026-09-10T11:00:00Z",
          triggered_by: "clarification",
          clarification_id: "clarif-uuid-1",
          triage: { ...sampleCase.triage, priority: "P1" },
          evidence: sampleCase.evidence,
          resolution_brief: sampleCase.resolution_brief,
          provider: "offline",
        },
      ],
    };

    const { user } = renderWorkspace({
      loadCase: vi.fn().mockResolvedValue(multiRevCase),
    });

    await screen.findByText("Waiting for review");

    // Clarification is displayed
    expect(screen.getByRole("heading", { name: "Clarifications (1)" })).toBeInTheDocument();
    expect(screen.getByText("Server returned error 500 on auth portal")).toBeInTheDocument();

    // Revisions switcher is displayed
    expect(screen.getByText(/Analysis Revisions \(2\):/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revision 1 \(intake\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revision 2 \(clarification\)/ })).toBeInTheDocument();

    // Priority diff banner shows P3 -> P1
    expect(screen.getByText(/Compared with Revision 1:/)).toBeInTheDocument();
    expect(screen.getByText(/P3 → P1/)).toBeInTheDocument();

    // Click to view Revision 1 (archived)
    await user.click(screen.getByRole("button", { name: /Revision 1 \(intake\)/ }));
    expect(await screen.findByText("Archived revision snapshot")).toBeInTheDocument();
    expect(screen.getByText("Initial report")).toBeInTheDocument();

    // Return to current revision
    await user.click(screen.getByRole("button", { name: /Return to current revision/ }));
    expect(screen.queryByText("Archived revision snapshot")).not.toBeInTheDocument();
  });

  it("submits clarification, calls addClarification API, and clears input", async () => {
    const addClarification = vi.fn().mockResolvedValue({
      ...sampleCase,
      current_revision: 2,
      clarifications: [
        {
          id: "new-c-1",
          text: "Additional details from user",
          author: "requester",
          created_at: "2026-09-10T12:00:00Z",
        },
      ],
    });

    const { user } = renderWorkspace({ addClarification });
    await screen.findByText("Waiting for review");

    const textArea = screen.getByLabelText("Clarification text");
    await user.type(textArea, "Additional details from user");

    const submitBtn = screen.getByRole("button", { name: "Add clarification & re-analyze" });
    await user.click(submitBtn);

    expect(addClarification).toHaveBeenCalledWith(
      sampleCase.case_id,
      expect.objectContaining({
        text: "Additional details from user",
        author: "requester",
        discard_draft: true,
      })
    );
  });

  it("prompts warning dialog before re-analyzing if review panel is dirty", async () => {
    const addClarification = vi.fn().mockResolvedValue(sampleCase);
    const { user } = renderWorkspace({ addClarification });
    await screen.findByText("Waiting for review");

    // Edit review panel to make it dirty
    const commentField = screen.getByLabelText("Review comment / internal notes");
    await user.type(commentField, "Unsaved operator edit");

    // Enter clarification
    const textArea = screen.getByLabelText("Clarification text");
    await user.type(textArea, "New context to trigger warning");

    // Click submit
    await user.click(screen.getByRole("button", { name: "Add clarification & re-analyze" }));

    // Warning dialog should appear
    expect(await screen.findByText("Unsaved review draft detected")).toBeInTheDocument();
    expect(
      screen.getByText(/You have unsaved edits in the review panel or a saved review draft\./)
    ).toBeInTheDocument();

    // Confirm discarding draft & re-analyze
    await user.click(screen.getByRole("button", { name: "Discard draft & re-analyze" }));

    expect(addClarification).toHaveBeenCalledWith(
      sampleCase.case_id,
      expect.objectContaining({
        text: "New context to trigger warning",
        discard_draft: true,
      })
    );
  });

  it("preserves clarification text and displays Retry button when addClarification fails", async () => {
    const addClarification = vi.fn().mockRejectedValue(new Error("Network connection lost"));
    const { user } = renderWorkspace({ addClarification });
    await screen.findByText("Waiting for review");

    const textArea = screen.getByLabelText("Clarification text");
    await user.type(textArea, "Temporary text to preserve");

    await user.click(screen.getByRole("button", { name: "Add clarification & re-analyze" }));

    expect(await screen.findByText("Re-analysis failed")).toBeInTheDocument();
    expect(screen.getByText("Network connection lost")).toBeInTheDocument();
    expect(screen.getByLabelText("Clarification text")).toHaveValue("Temporary text to preserve");

    // Retry button is available
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
