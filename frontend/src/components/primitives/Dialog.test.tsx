import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

function DialogHarness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      title="Approve and create mock incident"
      busy={busy}
      onClose={() => setOpen(false)}
    >
      <p>This creates one mock incident after the API accepts the review.</p>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("exposes a named dialog and restores close through the dismiss control", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    expect(
      screen.getByRole("dialog", { name: "Approve and create mock incident" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close from the backdrop while a request is in flight", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog
        open
        title="Approve and create mock incident"
        busy
        onClose={onClose}
      >
        <p>Submitting</p>
      </Dialog>,
    );

    await user.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
  });
});
