import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../api/client";
import type { CaseResponse } from "../../api/types";
import { DEMO_REQUEST, DEMO_SCENARIOS } from "./constants";
import { IntakeForm } from "./IntakeForm";

function renderIntake(createCase: (text: string) => Promise<CaseResponse>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/cases/new"]}>
        <Routes>
          <Route path="/cases/new" element={<IntakeForm createCase={createCase} />} />
          <Route path="/cases/:caseId" element={<p>Opened workspace</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("IntakeForm", () => {
  it("inserts a named demo scenario", async () => {
    const user = userEvent.setup();
    renderIntake(vi.fn());
    await user.click(screen.getByRole("button", { name: "Portal login 500" }));
    expect(screen.getByRole("textbox", { name: "Describe the support issue" })).toHaveValue(
      DEMO_REQUEST,
    );
  });

  it("inserts one of the demo scenarios from Use demo request", async () => {
    const user = userEvent.setup();
    renderIntake(vi.fn());
    await user.click(screen.getByRole("button", { name: "Use demo request" }));
    const value = (
      screen.getByRole("textbox", { name: "Describe the support issue" }) as HTMLTextAreaElement
    ).value;
    expect(DEMO_SCENARIOS.some((scenario) => scenario.text === value)).toBe(true);
  });

  it("announces invalid empty input and focuses the field", async () => {
    const user = userEvent.setup();
    const createCase = vi.fn();
    renderIntake(createCase);
    await user.click(screen.getByRole("button", { name: "Analyze request" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/describe the support issue/i);
    expect(screen.getByRole("textbox", { name: "Describe the support issue" })).toHaveFocus();
    expect(createCase).not.toHaveBeenCalled();
  });

  it("creates a case and routes to the workspace", async () => {
    const user = userEvent.setup();
    const createCase = vi.fn().mockResolvedValue({ case_id: "case-123" });
    renderIntake(createCase);
    await user.click(screen.getByRole("button", { name: "Portal login 500" }));
    await user.click(screen.getByRole("button", { name: "Analyze request" }));
    expect(createCase).toHaveBeenCalledWith(DEMO_REQUEST);
    expect(await screen.findByText("Opened workspace")).toBeInTheDocument();
  });

  it("keeps the request text and offers retry when the API fails", async () => {
    const user = userEvent.setup();
    const createCase = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, "http_error", "API unavailable"))
      .mockResolvedValueOnce({ case_id: "case-123" });
    renderIntake(createCase);
    await user.click(screen.getByRole("button", { name: "Portal login 500" }));
    await user.click(screen.getByRole("button", { name: "Analyze request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/API unavailable/);
    expect(screen.getByText(/http:\/\/127\.0\.0\.1:8000/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Describe the support issue" })).toHaveValue(
      DEMO_REQUEST,
    );
    await user.click(screen.getByRole("button", { name: "Retry analysis" }));
    await waitFor(() => expect(createCase).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Opened workspace")).toBeInTheDocument();
  });

  it("blocks duplicate submits while the API request is in flight", async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: CaseResponse) => void = () => undefined;
    const createCase = vi.fn(
      () =>
        new Promise<CaseResponse>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderIntake(createCase);
    await user.click(screen.getByRole("button", { name: "Portal login 500" }));
    await user.click(screen.getByRole("button", { name: "Analyze request" }));
    expect(screen.getByRole("button", { name: "Analyze request" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Analyze request" })).toHaveAttribute("aria-busy", "true");
    await user.click(screen.getByRole("button", { name: "Analyze request" }));
    expect(createCase).toHaveBeenCalledTimes(1);
    resolveCreate({ case_id: "case-123" } as CaseResponse);
    expect(await screen.findByText("Opened workspace")).toBeInTheDocument();
  });
});
