import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { CaseQueueItem } from "../../api/types";
import { CasesQueue, type CasesQueueProps } from "./CasesQueue";

const sampleItems: CaseQueueItem[] = [
  {
    case_id: "11111111-1111-4111-8111-111111111111",
    status: "awaiting_human_review",
    priority: "P1",
    risk: "high",
    request_text: "Sales portal login 500 error after update",
    version: 1,
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
  },
  {
    case_id: "22222222-2222-4222-8222-222222222222",
    status: "completed",
    priority: "P2",
    risk: "medium",
    request_text: "VPN certificate rotation issue",
    version: 2,
    created_at: "2026-08-13T09:00:00Z",
    updated_at: "2026-08-13T09:30:00Z",
  },
];

function defaultProps(): CasesQueueProps {
  return {
    items: sampleItems,
    total: 2,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    loading: false,
    error: null,
    statusFilter: "awaiting_human_review",
    priorityFilter: "",
    searchQuery: "",
    onStatusChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onSearchChange: vi.fn(),
    onPageChange: vi.fn(),
    onResetFilters: vi.fn(),
    onRetry: vi.fn(),
  };
}

function renderQueue(props: CasesQueueProps) {
  return render(
    <MemoryRouter>
      <CasesQueue {...props} />
    </MemoryRouter>,
  );
}

describe("CasesQueue", () => {
  it("renders case queue items with status, priority, risk, and workspace links", () => {
    renderQueue(defaultProps());

    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);

    expect(within(articles[0]).getByText("Sales portal login 500 error after update")).toBeInTheDocument();
    expect(within(articles[0]).getByText("Waiting for review")).toBeInTheDocument();
    expect(within(articles[0]).getByText("P1")).toBeInTheDocument();
    expect(within(articles[0]).getByText("high risk")).toBeInTheDocument();
    expect(within(articles[0]).getByText("v1")).toBeInTheDocument();

    expect(within(articles[1]).getByText("VPN certificate rotation issue")).toBeInTheDocument();
    expect(within(articles[1]).getByText("Completed")).toBeInTheDocument();
    expect(within(articles[1]).getByText("P2")).toBeInTheDocument();
    expect(within(articles[1]).getByText("medium risk")).toBeInTheDocument();
    expect(within(articles[1]).getByText("v2")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /Open case/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/cases/11111111-1111-4111-8111-111111111111");
  });

  it("handles filter and search change callbacks", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    renderQueue(props);

    const searchInput = screen.getByRole("searchbox", { name: /Search cases/i });
    await user.type(searchInput, "login");
    expect(props.onSearchChange).toHaveBeenCalled();

    const statusSelect = screen.getByRole("combobox", { name: /Filter by status/i });
    await user.selectOptions(statusSelect, "completed");
    expect(props.onStatusChange).toHaveBeenCalledWith("completed");

    const prioritySelect = screen.getByRole("combobox", { name: /Filter by priority/i });
    await user.selectOptions(prioritySelect, "P1");
    expect(props.onPriorityChange).toHaveBeenCalledWith("P1");
  });

  it("renders pagination controls and triggers page change", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      total: 25,
      page: 2,
      totalPages: 3,
    };
    renderQueue(props);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent("Showing 11–20 of 25 cases");

    const prevBtn = screen.getByRole("button", { name: /Previous page/i });
    const nextBtn = screen.getByRole("button", { name: /Next page/i });
    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    await user.click(prevBtn);
    expect(props.onPageChange).toHaveBeenCalledWith(1);

    await user.click(nextBtn);
    expect(props.onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders empty state with reset filters button when filters are active", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      items: [],
      total: 0,
      totalPages: 0,
      searchQuery: "non-existent query",
    };
    renderQueue(props);

    expect(screen.getByText("No cases found")).toBeInTheDocument();
    const resetBtn = screen.getByRole("button", { name: /Reset filters/i });
    await user.click(resetBtn);
    expect(props.onResetFilters).toHaveBeenCalled();
  });

  it("renders error state with retry button", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps(),
      items: [],
      total: 0,
      error: "Network error fetching queue",
    };
    renderQueue(props);

    expect(screen.getByText("Could not load cases queue")).toBeInTheDocument();
    expect(screen.getByText("Network error fetching queue")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    await user.click(retryBtn);
    expect(props.onRetry).toHaveBeenCalled();
  });
});
