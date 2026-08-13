import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextField } from "./TextField";

describe("TextField", () => {
  it("associates the label, hint, and error with the input", () => {
    render(
      <TextField
        label="Actor"
        hint="Use an operator identifier"
        error="Actor is required"
        defaultValue=""
      />,
    );

    const input = screen.getByRole("textbox", { name: "Actor" });
    expect(input).toHaveAccessibleDescription(/Use an operator identifier/);
    expect(input).toHaveAccessibleDescription(/Actor is required/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Actor is required");
  });
});
