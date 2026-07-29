import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );
  expect(seriousViolations, JSON.stringify(seriousViolations, null, 2)).toEqual([]);
}

test("Jacomo workflow has no critical or serious accessibility violations", async ({ page }) => {
  await page.goto("/e2e/jacomo");
  await expectNoSeriousAxeViolations(page);
});

test("workflow can progress through keyboard controls", async ({ page }) => {
  await page.goto("/e2e/jacomo");

  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await signIn.focus();
  await page.keyboard.press("Enter");

  const workspace = page.getByRole("button", { name: "Use Plume workspace", exact: true });
  await workspace.focus();
  await page.keyboard.press("Enter");

  const continueToCampaign = page.getByRole("button", {
    name: "Continue to campaign",
    exact: true,
  });
  await expect(continueToCampaign).toBeEnabled();
  await continueToCampaign.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Create campaign" })).toBeVisible();
});

test("workflow remains usable with reduced motion and forced colors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/e2e/jacomo");
  await expect(page.getByRole("heading", { name: "Jacomo campaign workflow" })).toBeVisible();
  await expectNoSeriousAxeViolations(page);

  const mediaState = await page.evaluate(() => ({
    forcedColors: (
      globalThis as unknown as {
        matchMedia: (query: string) => { matches: boolean };
      }
    ).matchMedia("(forced-colors: active)").matches,
    reducedMotion: (
      globalThis as unknown as {
        matchMedia: (query: string) => { matches: boolean };
      }
    ).matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  expect(mediaState).toEqual({ forcedColors: true, reducedMotion: true });
});

test("workflow remains readable at 200 percent zoom", async ({ page }) => {
  await page.goto("/e2e/jacomo");
  await page.evaluate(() => {
    (
      globalThis as unknown as {
        document: { documentElement: { style: { zoom: string } } };
      }
    ).document.documentElement.style.zoom = "2";
  });
  await expect(page.getByRole("heading", { name: "Jacomo campaign workflow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expectNoSeriousAxeViolations(page);
});

test("workflow reflows at compact width without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/jacomo");
  await expect(page.getByRole("heading", { name: "Jacomo campaign workflow" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: (
      globalThis as unknown as {
        document: { documentElement: { clientWidth: number } };
      }
    ).document.documentElement.clientWidth,
    scrollWidth: (
      globalThis as unknown as {
        document: { documentElement: { scrollWidth: number } };
      }
    ).document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expectNoSeriousAxeViolations(page);
});
