import { expect, test, type Download, type Page } from "@playwright/test";

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG_SIGNATURE");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.subarray(0, 3).toString("hex") !== "ffd8ff") throw new Error("JPEG_SIGNATURE");
  if (bytes.subarray(-2).toString("hex") !== "ffd9") throw new Error("JPEG_EOI");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG_DIMENSIONS");
}

async function browserImage(page: Page, mimeType: string) {
  return page.evaluate(async (type: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("fixture canvas unavailable");
    context.fillStyle = "#e879f9";
    context.fillRect(0, 0, 64, 48);
    context.fillStyle = "#0f172a";
    context.fillRect(8, 8, 48, 32);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("fixture encode"))),
        type,
        0.9,
      );
    });
    return {
      name: type === "image/png" ? "product.png" : "product.jpg",
      mimeType: type,
      buffer: [...new Uint8Array(await blob.arrayBuffer())],
    };
  }, mimeType);
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("DOWNLOAD_STREAM_MISSING");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("uploads source and product bytes, then downloads real PNG and JPG codecs", async ({
  page,
}) => {
  await page.goto("/e2e/jacomo-user-upload");
  await expect(page.getByTestId("jacomo-user-upload-screen")).toBeVisible();
  await expect(page.getByTestId("generate-assets")).toBeDisabled();

  await page.getByTestId("source-file-input").setInputFiles({
    name: "jacomo-brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "JACOMO Synthetic Autumn Sofa\nKakao Moment Bizboard acceptance QA",
      "utf8",
    ),
  });
  await page.getByTestId("upload-source").click();
  await expect(page.getByTestId("source-uploaded")).toContainText("checksum verified");

  const png = await browserImage(page, "image/png");
  const jpg = await browserImage(page, "image/jpeg");
  await page.getByTestId("product-image-input").setInputFiles([
    { name: png.name, mimeType: png.mimeType, buffer: Buffer.from(png.buffer) },
    { name: jpg.name, mimeType: jpg.mimeType, buffer: Buffer.from(jpg.buffer) },
  ]);
  await page.getByTestId("upload-products").click();
  await expect(page.getByTestId("products-uploaded")).toHaveText("2 image checksum(s) verified");

  await page.getByTestId("generate-assets").click();
  await expect(page.getByTestId("output-complete")).toHaveText(
    "PNG and JPG ready; browser decode PASS.",
  );
  await expect(page.getByTestId("output-png")).toContainText(
    "jacomo-bizboard-1029x258-variant-01.png",
  );
  await expect(page.getByTestId("output-jpg")).toContainText(
    "jacomo-bizboard-1029x258-variant-01.jpg",
  );

  const pngDownload = page.waitForEvent("download");
  await page.getByTestId("output-png").getByRole("button", { name: "Download PNG" }).click();
  const pngBytes = await downloadBytes(await pngDownload);
  expect(pngBytes.length).toBeGreaterThan(1024);
  expect(pngDimensions(pngBytes)).toEqual({ width: 1029, height: 258 });

  const jpgDownload = page.waitForEvent("download");
  await page.getByTestId("output-jpg").getByRole("button", { name: "Download JPG" }).click();
  const jpgBytes = await downloadBytes(await jpgDownload);
  expect(jpgBytes.length).toBeGreaterThan(1024);
  expect(jpegDimensions(jpgBytes)).toEqual({ width: 1029, height: 258 });
});

test("does not enable generation without a verified product image", async ({ page }) => {
  await page.goto("/e2e/jacomo-user-upload");
  await page.getByTestId("source-file-input").setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("", "utf8"),
  });
  await page.getByTestId("upload-source").click();
  await expect(page.getByTestId("upload-error")).toHaveText("SOURCE_TEXT_SIZE_INVALID");
  await expect(page.getByTestId("generate-assets")).toBeDisabled();
});
