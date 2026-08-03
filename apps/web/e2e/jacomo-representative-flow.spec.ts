import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const sourcePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("completes the Jacomo campaign from sign-in to export", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/e2e/jacomo");

  await expect(page.getByRole("heading", { name: "Jacomo campaign workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Use Plume workspace" }).click();
  await page.getByRole("button", { name: "Continue to campaign" }).click();

  await page.getByLabel("Campaign name").fill("Jacomo Spring Campaign");
  await page.getByRole("button", { name: "Continue to upload" }).click();
  await page.getByLabel("Creative source file").setInputFiles({
    name: "jacomo-source.png",
    mimeType: "image/png",
    buffer: sourcePng,
  });
  await page.getByRole("button", { name: "Continue to brief" }).click();

  await page
    .getByRole("textbox", { name: "Campaign brief" })
    .fill("Launch the Jacomo spring collection with a clean, premium product story.");
  await page.getByRole("button", { name: "Continue to products" }).click();
  for (const name of ["카르마", "플룸", "엘리쉬"]) {
    await page.getByRole("checkbox", { name }).check();
  }
  await page.getByRole("button", { name: "Continue to assets" }).click();
  await page.getByRole("button", { name: "Use hero asset" }).click();
  await page.getByRole("button", { name: "Continue to channel" }).click();
  await page.getByRole("combobox", { name: "Channel" }).selectOption("KAKAO_MOMENT");
  await page.getByRole("combobox", { name: "Format" }).selectOption("kakao-moment-bizboard-1029x258");
  await page.getByRole("button", { name: "Continue to generation" }).click();

  await page.getByRole("button", { name: "Generate three creatives" }).click();
  await expect(page.getByRole("heading", { name: "Generated gallery" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Generated creatives" }).getByRole("listitem"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Open editor" }).click();

  await page.getByRole("button", { name: "Preview AI edit" }).click();
  await expect(page.getByText("AI edit preview", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Apply AI edit" }).click();
  await page.getByRole("button", { name: "Continue to validation" }).click();
  await page.getByRole("button", { name: "Re-run validation" }).click();
  await expect(page.getByText("0 errors", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Continue to approval" }).click();
  await page.getByRole("button", { name: "Approve campaign" }).click();
  await page.getByRole("button", { name: "Continue to export" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("jacomo-spring-campaign-export.json");
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const manifest = JSON.parse(await readFile(downloadedPath!, "utf8")) as {
    channel?: { id?: string };
    formatProfile?: { id?: string; channelCode?: string };
  };
  expect(manifest.channel).toMatchObject({ id: "KAKAO_MOMENT" });
  expect(manifest.formatProfile).toMatchObject({
    id: "kakao-moment-bizboard-1029x258",
    channelCode: "KAKAO_MOMENT",
  });
  await expect(page.getByText("Export downloaded successfully.")).toBeVisible();
});
