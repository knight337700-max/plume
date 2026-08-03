import { expect, test, type Page } from "@playwright/test";

const workflowViews = [
  ["campaign", 2, "Campaign"],
  ["source", 3, "Source"],
  ["brief", 4, "Brief"],
  ["matching", 5, "Products"],
  ["asset", 6, "Assets"],
  ["channel", 7, "Channel"],
  ["format", 7, "Channel"],
  ["generation", 8, "Generate"],
  ["gallery", 9, "Gallery"],
] as const;

async function openWorkflowStep(page: Page, stepNumber: number, label: string) {
  await page.getByRole("button", { name: `Step ${stepNumber}: ${label}`, exact: true }).click();
  await expect(page.locator("[data-screen-id='e2e-jacomo-workflow']")).toBeVisible();
}

async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/jacomo");
  await expect(page.getByRole("heading", { name: "Jacomo campaign workflow" })).toBeVisible();
});

test("captures the deterministic Jacomo representative views", async ({ page }) => {
  await page.goto("/");
  await capture(page, "dashboard");
  await page.goto("/e2e/jacomo");

  for (const [name, stepNumber, label] of workflowViews) {
    await openWorkflowStep(page, stepNumber, label);
    if (name === "channel" || name === "format") {
      await page.getByRole("combobox", { name: "Channel" }).selectOption("KAKAO_MOMENT");
      await page.getByRole("combobox", { name: "Format" }).selectOption("kakao-moment-bizboard-1029x258");
    }
    await capture(page, name);
  }

  await openWorkflowStep(page, 9, "Gallery");
  await page.getByRole("button", { name: "Open editor", exact: true }).click();
  await capture(page, "editor-1440");

  await page.setViewportSize({ width: 1280, height: 900 });
  await capture(page, "editor-1280");

  await openWorkflowStep(page, 11, "Validation");
  await capture(page, "validation");
  await openWorkflowStep(page, 12, "Approval");
  await capture(page, "approval");
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkflowStep(page, 13, "Export");
  await capture(page, "export");
});
