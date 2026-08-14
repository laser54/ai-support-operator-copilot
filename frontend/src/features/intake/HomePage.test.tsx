import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { HomePage } from "../../pages/HomePage";

describe("HomePage", () => {
  it("shows the workflow strip, trust statements, and intake CTA", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "AI Support Operator Copilot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Request")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText("Human gate")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();
    expect(screen.getByText(/fixture-backed evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/human approval required/i)).toBeInTheDocument();
    expect(screen.getByText(/traceable decisions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create demo case" })).toHaveAttribute(
      "href",
      "/cases/new",
    );
    expect(screen.getByRole("link", { name: /API documentation/i })).toHaveAttribute(
      "href",
      "http://127.0.0.1:8000/docs",
    );
    expect(screen.getByRole("heading", { name: "Architectural Highlights" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interactive Demo Scenarios" })).toBeInTheDocument();
  });
});
