import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { installMockApi } from "./mockApi";

async function createDemoCase(page: Page) {
  await page.goto("/cases/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Use demo request" }).click();
  await page.getByRole("button", { name: "Analyze request" }).click();
  await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installMockApi(page);
});

test("creates, inspects, edits, approves, and keeps a single mock incident", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Create demo case" }).first().click();
  await page.getByRole("button", { name: "Use demo request" }).click();
  await page.getByRole("button", { name: "Analyze request" }).click();
  await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();
  await expect(page.getByText("Waiting for review")).toBeVisible();
  await expect(page.getByText("kb-auth-5xx-after-release", { exact: true })).toBeVisible();
  await expect(page.getByText("inc-104", { exact: true })).toBeVisible();
  await expect(page.getByText("status-portal-auth-5xx", { exact: true })).toBeVisible();
  await expect(page.getByText(/86% confidence/)).toBeVisible();

  await page.getByRole("button", { name: "Edit analysis" }).click();
  await page.getByLabel("Priority").selectOption("P2");
  await page.getByRole("button", { name: "Edit reply", exact: true }).click();
  await page.getByLabel("Reply draft").fill("Engineering is investigating.");
  await page.getByRole("button", { name: "Approve and create mock incident" }).click();
  await expect(page.getByRole("dialog", { name: "Approve and create mock incident" })).toContainText(
    "P2",
  );
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByText("MOCK-1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve and create mock incident" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("MOCK-1", { exact: true })).toBeVisible();
  await expect(page.getByText("P2", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Engineering is investigating.")).toBeVisible();
  await page.getByRole("button", { name: "Copy customer reply" }).click();
  await expect(page.getByRole("status")).toContainText("Reply copied to clipboard");

  await page.locator("#trace").getByText(/Audit trail/).click();
  await expect(page.getByText("Mock incident executed")).toBeVisible();
  await page.getByRole("button", { name: /Execution 1/ }).click();
  await expect(page.locator("#trace").getByRole("listitem")).toHaveCount(1);
});

test("rejects without creating a mock incident", async ({ page }) => {
  await createDemoCase(page);
  await page.getByRole("button", { name: "Reject proposal" }).click();
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(page.getByText("No incident was created. The write action stayed blocked.", { exact: true })).toBeVisible();
  await page.locator("#trace").getByText(/Audit trail/).click();
  await expect(page.getByText("Action rejected")).toBeVisible();
  await expect(page.getByText("Mock incident executed")).toHaveCount(0);
});

test("keeps intake text and retries after an API failure", async ({ page }) => {
  await page.route("http://127.0.0.1:8000/cases", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Accept,Content-Type",
        },
      });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: { code: "unavailable", message: "API unavailable" } }),
      });
    }
  });
  await page.goto("/cases/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Use demo request" }).click();
  await page.getByRole("button", { name: "Analyze request" }).click();
  await expect(page.getByRole("alert")).toContainText("API unavailable");
  await expect(page.getByText(/http:\/\/127\.0\.0\.1:8000/)).toBeVisible();
  await expect(page.getByLabel("Describe the support issue")).not.toHaveValue("");
});

test("shows a recovery path for an unknown case", async ({ page }) => {
  await page.goto("/cases/00000000-0000-4000-8000-000000000404", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Case not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a new case" })).toBeVisible();
});

test("remains usable at mobile, tablet, and desktop widths", async ({ page }) => {
  await createDemoCase(page);
  for (const width of [320, 768, 1280] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Case workflow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and create mock incident" })).toBeVisible();
    await test.info().attach(`workspace-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
});

test("supports cases queue search, filters, review, and status update", async ({ page }) => {
  // 1. Create first case
  await page.goto("/cases/new", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Describe the support issue").fill("Portal access 500 error for sales department");
  await page.getByRole("button", { name: "Analyze request" }).click();
  await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();

  // 2. Create second case
  await page.goto("/cases/new", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Describe the support issue").fill("VPN gateway certificate expired");
  await page.getByRole("button", { name: "Analyze request" }).click();
  await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();

  // 3. Navigate to Cases Queue
  await page.goto("/cases", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Cases Queue" })).toBeVisible();
  await expect(page.getByText("Portal access 500 error for sales department")).toBeVisible();
  await expect(page.getByText("VPN gateway certificate expired")).toBeVisible();

  // 4. Filter / Search for the target case
  const searchInput = page.getByRole("searchbox", { name: "Search cases by text or UUID" });
  await searchInput.fill("VPN gateway");
  await expect(page.getByText("VPN gateway certificate expired")).toBeVisible();
  await expect(page.getByText("Portal access 500 error for sales department")).toHaveCount(0);

  // 5. Open the target case workspace
  await page.getByRole("link", { name: /Open case/ }).click();
  await expect(page.getByRole("heading", { name: "Case workspace" })).toBeVisible();
  await expect(page.getByText("Waiting for review")).toBeVisible();

  // 6. Review and approve the proposal
  await page.getByRole("button", { name: "Approve and create mock incident" }).click();
  await page.getByRole("button", { name: "Confirm approval" }).click();
  await expect(page.getByText("MOCK-1", { exact: true })).toBeVisible();

  // 7. Return to queue via the Back to cases queue link
  await page.getByRole("link", { name: "← Back to cases queue" }).click();
  await expect(page.getByRole("heading", { name: "Cases Queue" })).toBeVisible();

  // 8. In the queue, change status filter to Completed to see updated status
  await page.getByRole("combobox", { name: "Filter by status" }).selectOption("completed");
  await expect(page.getByText("VPN gateway certificate expired")).toBeVisible();
  await expect(page.getByRole("feed", { name: "Cases list" }).getByText("Completed")).toBeVisible();

  // 9. Verify 375px mobile viewport layout
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("heading", { name: "Cases Queue" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search cases by text or UUID" })).toBeVisible();
});

test("has no critical or serious accessibility findings on the demo path", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const home = await new AxeBuilder({ page }).analyze();
  expect(home.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual(
    [],
  );
  await page.goto("/cases", { waitUntil: "domcontentloaded" });
  const queueAxe = await new AxeBuilder({ page }).analyze();
  expect(queueAxe.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual(
    [],
  );
  await page.goto("/cases/new", { waitUntil: "domcontentloaded" });
  const intake = await new AxeBuilder({ page }).analyze();
  expect(intake.violations.filter((item) => item.impact === "critical" || item.impact === "serious")).toEqual(
    [],
  );
  await createDemoCase(page);
  const workspace = await new AxeBuilder({ page }).analyze();
  expect(
    workspace.violations.filter((item) => item.impact === "critical" || item.impact === "serious"),
  ).toEqual([]);
});
