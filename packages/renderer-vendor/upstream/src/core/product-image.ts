import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import type { ContractBundle } from "./contracts.js";
import {
  ALPHA_SOLID_THRESHOLD,
  ISOLATED_COMPONENT_RATIO,
  LAYOUT_VISIBLE_THRESHOLD,
  MAX_UPSCALE,
  OBJECT_SLOT,
  RECOMMENDED_OBJECT_WIDTH,
  TRIM_PRESERVE_THRESHOLD,
} from "./constants.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import { sha256File } from "./hash.js";
import { detectImageMimeFromBytes, mimeForImageExtension } from "./image-input.js";
import type { BBox, ProductAnalysis, ValidationIssue } from "./types.js";

type Component = BBox & {
  count: number;
};

function alphaAt(data: Uint8Array, pixelIndex: number): number {
  return data[pixelIndex * 4 + 3] ?? 0;
}

function unionBoxes(boxes: readonly BBox[]): BBox {
  const minX = Math.min(...boxes.map(({ x }) => x));
  const minY = Math.min(...boxes.map(({ y }) => y));
  const maxX = Math.max(...boxes.map(({ x, width }) => x + width));
  const maxY = Math.max(...boxes.map(({ y, height }) => y + height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function thresholdBox(data: Uint8Array, width: number, height: number, threshold: number): BBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(data, y * width + x) < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function connectedComponents(data: Uint8Array, width: number, height: number): Component[] {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components: Component[] = [];
  const neighbors = [-1, 0, 1] as const;

  for (let index = 0; index < total; index += 1) {
    if (visited[index] === 1 || alphaAt(data, index) < LAYOUT_VISIBLE_THRESHOLD) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = index;
    visited[index] = 1;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    while (head < tail) {
      const current = queue[head++];
      if (current === undefined) break;
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const dy of neighbors) {
        for (const dx of neighbors) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (visited[neighbor] === 1 || alphaAt(data, neighbor) < LAYOUT_VISIBLE_THRESHOLD) continue;
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count });
  }
  return components;
}

function meaningfulLayout(
  data: Uint8Array,
  width: number,
  height: number,
): { box: BBox | null; ignoredCount: number } {
  const components = connectedComponents(data, width, height).sort(
    (left, right) =>
      right.count - left.count ||
      left.y - right.y ||
      left.x - right.x ||
      left.y + left.height - (right.y + right.height) ||
      left.x + left.width - (right.x + right.width),
  );
  const main = components[0];
  if (!main) return { box: null, ignoredCount: 0 };
  const meaningful = [main];
  let ignoredCount = 0;
  for (const component of components.slice(1)) {
    if (component.count / main.count < ISOLATED_COMPONENT_RATIO) ignoredCount += 1;
    else meaningful.push(component);
  }
  return { box: unionBoxes(meaningful), ignoredCount };
}

function opaqueBackgroundSuspected(data: Uint8Array, width: number, height: number): boolean {
  const cornerIndexes = [0, width - 1, (height - 1) * width, height * width - 1];
  if (!cornerIndexes.every((index) => alphaAt(data, index) === 255)) return false;
  let solid = 0;
  for (let index = 0; index < width * height; index += 1) {
    if (alphaAt(data, index) >= ALPHA_SOLID_THRESHOLD) solid += 1;
  }
  return solid / (width * height) >= 0.95;
}

export async function analyzeAndResizeProduct(
  productPath: string,
  expectedSha256: string | null,
  contracts: ContractBundle,
): Promise<{ analysis?: ProductAnalysis; productDigest?: string; issues: ValidationIssue[] }> {
  const issues: ValidationIssue[] = [];
  let fileBytes = 0;
  try {
    fileBytes = (await stat(productPath)).size;
  } catch {
    return { issues: [createIssue(contracts.errorRegistry, "KBR-ASSET-001", "/assets/product/path")] };
  }
  if (fileBytes > 150_000) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-014", "/assets/product/path", {
        expected: { maximumBytes: 150_000 },
        actual: { bytes: fileBytes },
      }),
    );
  }

  const productDigest = await sha256File(productPath);
  if (expectedSha256 !== null && productDigest !== expectedSha256) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-007", "/assets/product/expectedSha256", {
        expected: expectedSha256,
        actual: productDigest,
      }),
    );
  }

  let detectedMimeType: ReturnType<typeof detectImageMimeFromBytes>;
  try {
    const bytes = await readFile(productPath);
    detectedMimeType = detectImageMimeFromBytes(bytes);
    const expectedMimeType = mimeForImageExtension(path.extname(productPath));
    if (expectedMimeType === null || expectedMimeType !== detectedMimeType) {
      return {
        productDigest,
        issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ASSET-MIME-EXTENSION-MISMATCH", "/assets/product/path", { actual: detectedMimeType ?? "unknown", expected: expectedMimeType ?? "png" })],
      };
    }
  } catch {
    return { productDigest, issues: [...issues, createIssue(contracts.errorRegistry, "KBR-IMAGE-DECODE-FAILED", "/assets/product/path")] };
  }
  if (detectedMimeType !== "image/png") {
    return {
      productDigest,
      issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ASSET-MIME-NOT-ALLOWED", "/assets/product/path", { actual: detectedMimeType ?? "unknown", expected: "image/png" })],
    };
  }

  let image = sharp(productPath, { failOn: "error" });
  let metadata: Awaited<ReturnType<typeof image.metadata>>;
  try {
    metadata = await image.metadata();
  } catch {
    return { productDigest, issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ASSET-003", "/assets/product/path")] };
  }
  if (metadata.format !== "png") {
    return { productDigest, issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ASSET-002", "/assets/product/path")] };
  }
  if (!metadata.hasAlpha) {
    return { productDigest, issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ALPHA-CHANNEL-REQUIRED", "/assets/product/path")] };
  }

  let decoded: Buffer;
  let width: number;
  let height: number;
  try {
    image = image.rotate().toColourspace("srgb").ensureAlpha();
    const raw = await image.raw().toBuffer({ resolveWithObject: true });
    decoded = raw.data;
    width = raw.info.width;
    height = raw.info.height;
  } catch {
    return { productDigest, issues: [...issues, createIssue(contracts.errorRegistry, "KBR-ASSET-003", "/assets/product/path")] };
  }

  if (opaqueBackgroundSuspected(decoded, width, height)) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-ASSET-006", "/assets/product/path"));
  }
  const trimBox = thresholdBox(decoded, width, height, TRIM_PRESERVE_THRESHOLD);
  const sourceLayout = meaningfulLayout(decoded, width, height);
  if (!trimBox || !sourceLayout.box) {
    return {
      productDigest,
      issues: sortAndDedupeIssues([
        ...issues,
        createIssue(contracts.errorRegistry, "KBR-ASSET-005", "/assets/product/path"),
      ]),
    };
  }
  if (sourceLayout.ignoredCount > 0) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-012", "/assets/product/path", {
        actual: { ignoredComponents: sourceLayout.ignoredCount },
      }),
    );
  }

  const scale = Math.min(OBJECT_SLOT.width / trimBox.width, OBJECT_SLOT.height / trimBox.height);
  if (scale > MAX_UPSCALE) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-008", "/assets/product/path", {
        expected: { maximumScale: MAX_UPSCALE },
        actual: { scale },
      }),
    );
    return { productDigest, issues: sortAndDedupeIssues(issues) };
  }

  const resizedWidth = Math.max(1, Math.round(trimBox.width * scale));
  const resizedHeight = Math.max(1, Math.round(trimBox.height * scale));
  const destinationX = OBJECT_SLOT.x + Math.floor((OBJECT_SLOT.width - resizedWidth) / 2);
  const destinationY = OBJECT_SLOT.y + Math.floor((OBJECT_SLOT.height - resizedHeight) / 2);
  const resizedRgba = await sharp(decoded, { raw: { width, height, channels: 4 } })
    .extract({ left: trimBox.x, top: trimBox.y, width: trimBox.width, height: trimBox.height })
    .resize(resizedWidth, resizedHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();

  const resizedLayout = meaningfulLayout(resizedRgba, resizedWidth, resizedHeight);
  if (!resizedLayout.box) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-ASSET-005", "/assets/product/path"));
    return { productDigest, issues: sortAndDedupeIssues(issues) };
  }
  if (resizedLayout.ignoredCount > 0) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-012", "/assets/product/path", {
        actual: { ignoredComponentsAfterResize: resizedLayout.ignoredCount },
      }),
    );
  }
  const placedVisibleBox: BBox = {
    x: destinationX + resizedLayout.box.x,
    y: destinationY + resizedLayout.box.y,
    width: resizedLayout.box.width,
    height: resizedLayout.box.height,
  };
  if (placedVisibleBox.width < RECOMMENDED_OBJECT_WIDTH) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-ASSET-011", "/assets/product/path", {
        expected: { recommendedMinimumWidth: RECOMMENDED_OBJECT_WIDTH },
        actual: { width: placedVisibleBox.width },
        bbox: placedVisibleBox,
      }),
    );
  }
  const slotRight = OBJECT_SLOT.x + OBJECT_SLOT.width;
  const slotBottom = OBJECT_SLOT.y + OBJECT_SLOT.height;
  if (
    placedVisibleBox.x - OBJECT_SLOT.x <= 1 ||
    placedVisibleBox.y - OBJECT_SLOT.y <= 1 ||
    slotRight - (placedVisibleBox.x + placedVisibleBox.width) <= 1 ||
    slotBottom - (placedVisibleBox.y + placedVisibleBox.height) <= 1
  ) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-LAYOUT-009", "/assets/product/path", { bbox: placedVisibleBox }),
    );
  }
  if (
    placedVisibleBox.x < OBJECT_SLOT.x ||
    placedVisibleBox.y < OBJECT_SLOT.y ||
    placedVisibleBox.x + placedVisibleBox.width > slotRight ||
    placedVisibleBox.y + placedVisibleBox.height > slotBottom
  ) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-LAYOUT-005", "/assets/product/path", { bbox: placedVisibleBox }),
    );
  }

  return {
    analysis: {
      inputWidth: width,
      inputHeight: height,
      trimBox,
      sourceLayoutBox: sourceLayout.box,
      ignoredNoiseComponents: sourceLayout.ignoredCount,
      scale,
      resizedWidth,
      resizedHeight,
      destinationX,
      destinationY,
      placedVisibleBox,
      resizedRgba,
    },
    productDigest,
    issues: sortAndDedupeIssues(issues),
  };
}
