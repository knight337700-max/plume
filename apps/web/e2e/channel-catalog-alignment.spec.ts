import { expect, test, type Page } from "@playwright/test";

async function reachChannelStep(page: Page) {
  await page.goto("/e2e/jacomo");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Use Plume workspace" }).click();
  await page.getByRole("button", { name: "Continue to campaign" }).click();
  await page.getByLabel("Campaign name").fill("Channel Catalog Alignment");
  await page.getByRole("button", { name: "Continue to upload" }).click();
  await page.getByLabel("Creative source file").setInputFiles({
    name: "channel-catalog.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Continue to brief" }).click();
  await page.getByRole("textbox", { name: "Campaign brief" }).fill("Align channel catalog");
  await page.getByRole("button", { name: "Continue to products" }).click();
  for (const name of ["카르마", "플룸", "엘리쉬"]) {
    await page.getByRole("checkbox", { name }).check();
  }
  await page.getByRole("button", { name: "Continue to assets" }).click();
  await page.getByRole("button", { name: "Use hero asset" }).click();
  await page.getByRole("button", { name: "Continue to channel" }).click();
}

test("Jacomo channel step exposes the canonical four-channel catalog", async ({ page }) => {
  await reachChannelStep(page);
  const options = page.locator("#channel option");
  await expect(options).toHaveCount(5);
  await expect(options.nth(1)).toHaveAttribute("value", "NAVER_GFA");
  await expect(options.nth(2)).toHaveAttribute("value", "KAKAO_MOMENT");
  await expect(options.nth(3)).toHaveAttribute("value", "META");
  await expect(options.nth(4)).toHaveAttribute("value", "GOOGLE_ADS");
  await expect(options.nth(1)).toHaveText("Naver GFA");
  await expect(options.nth(2)).toHaveText("Kakao Moment");
  await expect(options.nth(3)).toHaveText("Meta");
  await expect(options.nth(4)).toHaveText("Google Ads");
});

test("filters approved formats and clears stale selections when the channel changes", async ({ page }) => {
  await reachChannelStep(page);
  const formats = page.locator("#format-profile option");

  await page.locator("#channel").selectOption("NAVER_GFA");
  await expect(formats).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("CATALOG_NOT_READY");

  await page.locator("#channel").selectOption("KAKAO_MOMENT");
  await expect(formats).toHaveCount(2);
  await expect(formats.nth(1)).toContainText("Bizboard");
  await page.locator("#format-profile").selectOption("kakao-moment-bizboard-1029x258");

  await page.locator("#channel").selectOption("META");
  await expect(page.locator("#format-profile")).toHaveValue("");
  await expect(formats).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("CATALOG_NOT_READY");
});

test("restores the persisted channel and format after refresh", async ({ page }) => {
  await reachChannelStep(page);
  await page.locator("#channel").selectOption("KAKAO_MOMENT");
  await page.locator("#format-profile").selectOption("kakao-moment-bizboard-1029x258");
  await page.reload();

  // The Local QA UI starts at Workspace after refresh; the media selection itself must survive.
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Use Plume workspace" }).click();
  await page.getByRole("button", { name: "Step 7: Channel", exact: true }).click();
  await expect(page.locator("#channel")).toHaveValue("KAKAO_MOMENT");
  await expect(page.locator("#format-profile")).toHaveValue("kakao-moment-bizboard-1029x258");
});
