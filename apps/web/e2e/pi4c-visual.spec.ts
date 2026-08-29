import { expect, test, type Page } from "@playwright/test";
import { creativeSearch, ids, mockPi4cApi } from "./pi4c-fixtures";

const primary = [
  ["ai-setup", `/w/${ids.workspace}/ai-creative/setup?${creativeSearch()}`],
  ["ai-format", `/w/${ids.workspace}/ai-creative/format?${creativeSearch()}`],
  ["ai-generate", `/w/${ids.workspace}/ai-creative/generate?${creativeSearch({ jobId: ids.job })}`],
  [
    "ai-editor",
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
  ],
  ["campaign-overview", `/w/${ids.workspace}/campaigns/${ids.campaign}`],
  ["campaign-assets", `/w/${ids.workspace}/campaigns/${ids.campaign}/assets`],
  ["campaign-projects", `/w/${ids.workspace}/campaigns/${ids.campaign}/projects`],
  ["project-overview", `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}`],
  [
    "project-assets",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}/assets`,
  ],
  [
    "project-creatives",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}/creatives`,
  ],
] as const;

async function screenshot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    fullPage: true,
  });
}

test.beforeEach(async ({ page }) => mockPi4cApi(page));

test("captures ten Light and ten Dark primary surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((value) => localStorage.setItem("gobanos.theme", value), theme);
    for (const [name, path] of primary) {
      await page.goto(path);
      await screenshot(page, `pi4c-${theme}-${name}`);
    }
  }
});

test("captures responsive editor parity in Light and Dark", async ({ page }) => {
  const path = `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`;
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((value) => localStorage.setItem("gobanos.theme", value), theme);
    for (const width of [1600, 1440, 1280, 1024, 800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await screenshot(page, `pi4c-${theme}-editor-${width}`);
    }
  }
});
