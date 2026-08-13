import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { approvedTrace, rejectedTrace, sampleTrace } from "../case-review/fixtures";
import { TraceTimeline } from "./TraceTimeline";

describe("TraceTimeline", () => {
  it("keeps backend sequence order and human-readable labels", () => {
    render(<TraceTimeline events={sampleTrace.events} loading={false} onRetry={() => undefined} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1.");
    expect(items[0]).toHaveTextContent("Case created");
    expect(items[1]).toHaveTextContent("Knowledge searched");
    expect(items[2]).toHaveTextContent("Similar cases checked");
    expect(items[3]).toHaveTextContent("Service status checked");
    expect(items[4]).toHaveTextContent("Brief built");
    expect(items[5]).toHaveTextContent("Human review requested");
    expect(items.map((item) => item.textContent?.match(/^\s*(\d+)\./)?.[1])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  it("shows source IDs on tool events and actor/decision on human events", () => {
    render(<TraceTimeline events={approvedTrace.events} loading={false} onRetry={() => undefined} />);
    expect(screen.getAllByText(/kb-auth-5xx-after-release/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/operator@example.test/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/decision=approve/).length).toBeGreaterThan(0);
  });

  it("filters without reordering remaining events", async () => {
    const user = userEvent.setup();
    render(<TraceTimeline events={approvedTrace.events} loading={false} onRetry={() => undefined} />);
    await user.click(screen.getByRole("button", { name: /Human 2/ }));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Review recorded");
    expect(items[1]).toHaveTextContent("Action approved");
    await user.click(screen.getByRole("button", { name: /Execution 1/ }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Mock incident executed");
  });

  it("does not show execution after rejection", async () => {
    const user = userEvent.setup();
    render(<TraceTimeline events={rejectedTrace.events} loading={false} onRetry={() => undefined} />);
    expect(screen.queryByText("Mock incident executed")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Execution 0/ }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("exposes correlation IDs in event details", async () => {
    const user = userEvent.setup();
    render(<TraceTimeline events={sampleTrace.events} loading={false} onRetry={() => undefined} />);
    await user.click(screen.getAllByText("Event details")[0]);
    expect(screen.getByText(/Correlation ID corr-1/)).toBeInTheDocument();
  });

  it("shows an independent retry path when loading fails", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<TraceTimeline loading={false} error="Trace unavailable" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Retry trace" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
