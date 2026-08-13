import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { CaseResponse, TraceResponse } from "../../api/types";
import { CaseWorkspace } from "./CaseWorkspace";
import { sampleCase, sampleTrace } from "./fixtures";

function renderWorkspace(options?: {
  loadCase?: (caseId: string) => Promise<CaseResponse>;
  loadTrace?: (caseId: string) => Promise<TraceResponse>;
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
  const copyText = options?.copyText ?? vi.fn().mockResolvedValue(undefined);
  return {
    loadCase,
    copyText,
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/cases/${sampleCase.case_id}`]}>
          <Routes>
            <Route
              path="/cases/:caseId"
              element={
                <CaseWorkspace loadCase={loadCase} loadTrace={loadTrace} copyText={copyText} />
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

  it("copies the case ID and evidence source IDs", async () => {
    const { user, copyText } = renderWorkspace();
    await screen.findByText("Waiting for review");
    await user.click(screen.getByRole("button", { name: "Copy case ID" }));
    expect(copyText).toHaveBeenCalledWith(sampleCase.case_id);
    await user.click(screen.getAllByRole("button", { name: "Copy source ID" })[0]);
    expect(copyText).toHaveBeenCalledWith("kb-auth-5xx-after-release");
  });
});
