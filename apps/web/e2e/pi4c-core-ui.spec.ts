import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { creativeSearch, ids, mockPi4cApi } from "./pi4c-fixtures";

const routes = [
  [
    "setup",
    `/w/${ids.workspace}/ai-creative/setup?${creativeSearch()}`,
    "Build the creative foundation",
  ],
  [
    "format",
    `/w/${ids.workspace}/ai-creative/format?${creativeSearch()}`,
    "Choose channels and formats",
  ],
  [
    "generate",
    `/w/${ids.workspace}/ai-creative/generate?${creativeSearch({ jobId: ids.job })}`,
    "Generation in progress",
  ],
  [
    "editor",
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
    "Creative editor",
  ],
  ["campaign", `/w/${ids.workspace}/campaigns/${ids.campaign}`, "Autumn Signal Launch"],
  [
    "campaign-assets",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/assets`,
    "Campaign Asset Pool",
  ],
  ["campaign-projects", `/w/${ids.workspace}/campaigns/${ids.campaign}/projects`, "Projects"],
  [
    "project",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}`,
    "Kakao First Flight",
  ],
  [
    "project-assets",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}/assets`,
    "Effective Asset Pool",
  ],
  [
    "project-creatives",
    `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}/creatives`,
    "Creative library",
  ],
  ["settings", `/w/${ids.workspace}/settings`, "Preferences"],
] as const;

test.beforeEach(async ({ page }) => mockPi4cApi(page));

test("all PI-4C surfaces resolve real workspace routes", async ({ page }) => {
  for (const [, path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
  }
});

test("Project generation submits identifiers without a client asset snapshot", async ({ page }) => {
  const requestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/generation-requests"),
  );
  await page.goto(`/w/${ids.workspace}/ai-creative/generate?${creativeSearch()}`);
  await page.getByRole("button", { name: "Start generation" }).click();
  const request = await requestPromise;
  const body = request.postDataJSON() as Record<string, unknown>;
  expect(body.projectId).toBe(ids.project);
  expect(body.formatSelectionIds).toEqual(["selection-1", "selection-3"]);
  expect(body).not.toHaveProperty("assetPoolSnapshot");
  await expect(page).toHaveURL(new RegExp(`jobId=${ids.job}`));
});

test("Channel and format choices persist exact Campaign Format Selection identities", async ({
  page,
}) => {
  const channelRequest = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith("/channels"),
  );
  const formatRequest = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith("/format-selections"),
  );
  await page.goto(`/w/${ids.workspace}/ai-creative/format?${creativeSearch()}`);
  await page.getByRole("button", { name: "Review generation" }).click();
  expect((await channelRequest).postDataJSON()).toEqual({
    items: [{ channelCode: "KAKAO_MOMENT" }],
  });
  expect((await formatRequest).postDataJSON()).toEqual({
    items: [
      { channelCode: "KAKAO_MOMENT", formatProfileId: "kakao-moment-bizboard-1029x258" },
      {
        channelCode: "KAKAO_MOMENT",
        formatProfileId: "kakao-moment-display-native-2-1-1200x600",
      },
    ],
  });
  await expect(page).toHaveURL(/formatSelectionIds=selection-1%2Cselection-3/);
});

test("generation recovery exposes job-level actions and no item retry", async ({ page }) => {
  await page.goto(`/w/${ids.workspace}/ai-creative/generate?${creativeSearch({ jobId: ids.job })}`);
  await expect(page.getByText("57%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh status" })).toBeVisible();
  await expect(page.getByRole("button", { name: /retry item/i })).toHaveCount(0);
});

test("theme selection persists and keeps context", async ({ page }) => {
  await page.goto(`/w/${ids.workspace}/settings`);
  await page.getByRole("radio", { name: /Dark/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: /Dark/ })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("deep links recover server context and browser history", async ({ page }) => {
  const overview = `/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}`;
  await page.goto(overview);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kakao First Flight" })).toBeVisible();
  await page.getByRole("link", { name: "Assets", exact: true }).click();
  await expect(page).toHaveURL(`${overview}/assets`);
  await page.goBack();
  await expect(page).toHaveURL(overview);
  await expect(page.getByRole("heading", { name: "Kakao First Flight" })).toBeVisible();
});

test("responsive navigation drawer returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(`/w/${ids.workspace}/settings`);
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  const close = page.getByRole("button", { name: "Close navigation" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});

test("limited editor mode preserves review controls below 1024", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
  );
  await expect(page.getByText("Limited editor mode")).toBeVisible();
  await expect(page.getByRole("region", { name: "Canvas workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit" })).toBeVisible();
});

test("editor resolves previews through the render-scoped download contract", async ({ page }) => {
  const downloadRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/creative-versions/${ids.version}/renders/render-1/download-url`),
  );
  await page.goto(
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
  );
  await downloadRequest;
  const artifact = page.getByRole("img", { name: /Renderer preview:/ });
  await expect(artifact).toBeVisible();
  await expect
    .poll(() => artifact.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1200);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByLabel("Canvas zoom")).toHaveText("90%");
  await page.getByRole("button", { name: "Fit" }).click();
  await expect(page.getByLabel("Canvas zoom")).toHaveText("80%");
  await page.reload();
  await expect(page.getByRole("img", { name: /Renderer preview:/ })).toBeVisible();
  await expect(page.getByText(/PREVIEW · renderer pixels/)).toBeVisible();
});

test("editor keeps deferred Validate and Finalize actions disabled", async ({ page }) => {
  const mutationRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto(
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
  );
  await expect(page.getByRole("img", { name: /Renderer preview:/ })).toBeVisible();

  const validate = page.getByRole("button", { name: "Validate" });
  const finalize = page.getByRole("button", { name: "Finalize" });
  await expect(validate).toBeDisabled();
  await expect(finalize).toBeDisabled();
  await expect(validate).toHaveAccessibleDescription(
    "Durable validation actions are not available in PI-4C.",
  );
  await expect(finalize).toHaveAccessibleDescription(
    "Finalize requires durable validation and approval readiness.",
  );

  await validate.evaluate((button) => button.focus());
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await finalize.evaluate((button) => button.focus());
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(mutationRequests).toEqual([]);
});

test("System theme follows OS and theme changes do not alter renderer artifact identity", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/w/${ids.workspace}/settings`);
  await page.getByRole("radio", { name: /System/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const editorPath = `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`;
  await page.goto(editorPath);
  const lightSource = await page
    .getByRole("img", { name: /Renderer preview:/ })
    .getAttribute("src");
  await page.evaluate(() => localStorage.setItem("gobanos.theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkSource = await page.getByRole("img", { name: /Renderer preview:/ }).getAttribute("src");
  expect(darkSource).toBe(lightSource);
});

test("reduced motion removes meaningful canvas transition duration", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    `/w/${ids.workspace}/ai-creative/editor?${creativeSearch({ creativeSetId: ids.set, creativeId: ids.creative })}`,
  );
  await expect(page.getByRole("img", { name: /Renderer preview:/ })).toBeVisible();
  const duration = await page
    .locator(".g-artboard-wrap")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001);
});

test("keyboard navigation reaches the skip link and workflow", async ({ page }) => {
  await page.goto(`/w/${ids.workspace}/ai-creative/setup?${creativeSearch()}`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.getByRole("link", { name: /Step 2 Channel \/ format/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose channels and formats" })).toBeVisible();
});

test("all twelve surfaces have no serious axe violations", async ({ page }) => {
  const allRoutes = [
    ["campaign-index", `/w/${ids.workspace}/campaigns`, "Campaigns"],
    ...routes,
  ] as const;
  for (const [name, path] of allRoutes) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const result = await new AxeBuilder({ page }).analyze();
    const violations = result.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(violations, `${name}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  }
});

test("management surfaces reflow at 200 percent without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/w/${ids.workspace}/campaigns/${ids.campaign}/projects/${ids.project}/assets`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("heading", { name: "Effective Asset Pool" })).toBeVisible();
});
