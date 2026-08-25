import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

import {
  MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID,
  MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID,
  type AppliedImagePlacement,
  type ImageAnchor,
  type ImagePlacementPlan,
  type LegacyRenderResult,
  type MaskSemicircleRenderRequest,
  type NormalizedRect,
  type RendererAssetDescriptor,
  normalizedRectToPixelRect,
} from "@kbr/renderer-contract";
import { koreanEquivalentUnits } from "./text-contract.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HEADLINE_BASELINE_Y,
  ISOLATED_COMPONENT_RATIO,
  LAYOUT_VISIBLE_THRESHOLD,
  SUBCOPY_BASELINE_Y,
  TEXT_DRAW_X,
} from "./constants.js";
import type { BBox, ValidationIssue } from "./types.js";

export const MASK_SEMICIRCLE_RIGHT_IMAGE_DESTINATION = Object.freeze({ x: 621, y: 45, width: 360, height: 213 });
export const MASK_SEMICIRCLE_RIGHT_LOGO_CONTAINER = Object.freeze({ x: 839, y: 16, width: 142, height: 60 });
export const MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX = Object.freeze({ x: 847, y: 24, width: 126, height: 44 });
export const MASK_SEMICIRCLE_RIGHT_TEXT_HARD_RIGHT_EDGE = 588;
export const MASK_SEMICIRCLE_RIGHT_TEXT_MAX_WIDTH = 540;
export const MASK_SEMICIRCLE_RIGHT_TEXT_WARNING_WIDTH = Math.floor(MASK_SEMICIRCLE_RIGHT_TEXT_MAX_WIDTH * 0.9);
export const MASK_SEMICIRCLE_RIGHT_LOGO_TRIM_THRESHOLD = 1;
export const MASK_SEMICIRCLE_RIGHT_MAX_UPSCALE = 1.5;

type Rgba = { data: Buffer; width: number; height: number };

function alphaAt(data: ArrayLike<number>, pixelIndex: number): number {
  return data[pixelIndex * 4 + 3] ?? 0;
}

function channelAt(data: ArrayLike<number>, index: number): number {
  return data[index] ?? 0;
}

function bboxAtThreshold(data: ArrayLike<number>, width: number, height: number, threshold: number): BBox | null {
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

type VisibleComponent = BBox & { count: number };

function meaningfulVisibleBBox(data: ArrayLike<number>, width: number, height: number): BBox | null {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components: VisibleComponent[] = [];
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] === 1 || alphaAt(data, start) < LAYOUT_VISIBLE_THRESHOLD) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
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
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
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
    if (maxX >= 0) components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count });
  }
  components.sort((left, right) => right.count - left.count || left.y - right.y || left.x - right.x);
  const main = components[0];
  if (!main) return null;
  const kept = components.filter((component, index) => index === 0 || component.count / main.count >= ISOLATED_COMPONENT_RATIO);
  const minX = Math.min(...kept.map((component) => component.x));
  const minY = Math.min(...kept.map((component) => component.y));
  const maxX = Math.max(...kept.map((component) => component.x + component.width));
  const maxY = Math.max(...kept.map((component) => component.y + component.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function alphaBBoxWithin(data: ArrayLike<number>, width: number, height: number, threshold: number, bounds: BBox): BBox | null {
  let minX = bounds.x + bounds.width;
  let minY = bounds.y + bounds.height;
  let maxX = bounds.x - 1;
  let maxY = bounds.y - 1;
  for (let y = bounds.y; y < bounds.y + bounds.height && y < height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width && x < width; x += 1) {
      if (alphaAt(data, y * width + x) < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < minX || maxY < minY ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function opaqueBackgroundSuspected(data: ArrayLike<number>, width: number, height: number): boolean {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  if (!corners.every((index) => alphaAt(data, index) === 255)) return false;
  let solid = 0;
  for (let index = 0; index < width * height; index += 1) if (alphaAt(data, index) >= 250) solid += 1;
  return solid / (width * height) >= 0.95;
}

async function readRgba(bytes: Uint8Array, label: string): Promise<Rgba> {
  const raw = await sharp(Buffer.from(bytes), { failOn: "error" }).rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!raw.info.width || !raw.info.height || raw.info.channels !== 4) throw new Error(`${label} does not decode to RGBA pixels`);
  return { data: raw.data, width: raw.info.width, height: raw.info.height };
}

function horizontalAnchor(anchor: ImageAnchor, excess: number): number {
  if (anchor.endsWith("LEFT")) return 0;
  if (anchor.endsWith("RIGHT")) return excess;
  return Math.floor(excess / 2);
}

function verticalAnchor(anchor: ImageAnchor, excess: number): number {
  if (anchor.startsWith("TOP")) return 0;
  if (anchor.startsWith("BOTTOM")) return excess;
  return Math.floor(excess / 2);
}

function issue(code: string, messageKey: string, path: string, detail: Partial<ValidationIssue> = {}): ValidationIssue {
  return { code, severity: "ERROR", messageKey, path, ...detail };
}

function measureText(field: "headline" | "subcopy", value: string): { bbox: BBox; width: number; rightExclusive: number } | null {
  if (!value) return null;
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  context.textBaseline = "alphabetic";
  context.font = `${field === "headline" ? 48 : 39}px "${field === "headline" ? FONT_ALIAS_BOLD : FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#000000";
  context.fillText(value, TEXT_DRAW_X, field === "headline" ? HEADLINE_BASELINE_Y : SUBCOPY_BASELINE_Y);
  const pixels = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
  const bbox = bboxAtThreshold(pixels, CANVAS_WIDTH, CANVAS_HEIGHT, 8);
  if (!bbox) return null;
  return { bbox, width: Math.max(0, bbox.x + bbox.width - TEXT_DRAW_X), rightExclusive: bbox.x + bbox.width };
}

function validateText(copy: MaskSemicircleRenderRequest["input"]["copy"]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [field, value, maxUnits] of [["headline", copy.headline ?? "", 12], ["subcopy", copy.subcopy ?? "", 15]] as const) {
    const measured = measureText(field, value);
    if (!measured) continue;
    const path = `/copy/${field}`;
    if (koreanEquivalentUnits(value) > maxUnits) issues.push(issue(field === "headline" ? "KBR-TEXT-COUNT-HEADLINE-001" : "KBR-TEXT-COUNT-SUBCOPY-001", field === "headline" ? "text.headline_korean_equivalent_limit" : "text.subcopy_korean_equivalent_limit", path, { actual: { koreanEquivalentUnits: koreanEquivalentUnits(value), limit: maxUnits }, expected: { maxKoreanEquivalentUnits: maxUnits }, bbox: measured.bbox }));
    if (measured.width > MASK_SEMICIRCLE_RIGHT_TEXT_MAX_WIDTH || measured.rightExclusive > MASK_SEMICIRCLE_RIGHT_TEXT_HARD_RIGHT_EDGE) issues.push(issue(field === "headline" ? "KBR-TEXT-004" : "KBR-TEXT-005", field === "headline" ? "text.headline_overflow" : "text.subcopy_overflow", path, { actual: { actualWidthPx: measured.width, rightExclusive: measured.rightExclusive }, expected: { maximumWidthPx: MASK_SEMICIRCLE_RIGHT_TEXT_MAX_WIDTH, hardRightEdgeExclusive: MASK_SEMICIRCLE_RIGHT_TEXT_HARD_RIGHT_EDGE }, bbox: measured.bbox }));
    else if (measured.width >= MASK_SEMICIRCLE_RIGHT_TEXT_WARNING_WIDTH) issues.push({ ...issue(field === "headline" ? "KBR-TEXT-WIDTH-HEADLINE-W001" : "KBR-TEXT-WIDTH-SUBCOPY-W001", field === "headline" ? "text.headline_width_warning" : "text.subcopy_width_warning", path, { actual: { actualWidthPx: measured.width, rightExclusive: measured.rightExclusive }, expected: { warningThresholdPx: MASK_SEMICIRCLE_RIGHT_TEXT_WARNING_WIDTH, maximumWidthPx: MASK_SEMICIRCLE_RIGHT_TEXT_MAX_WIDTH }, bbox: measured.bbox }), severity: "WARNING" });
  }
  return issues;
}

async function resizeCover(source: Rgba, cropRect: NormalizedRect, destination: { width: number; height: number }, anchor: ImageAnchor): Promise<{ rgba: Buffer; cropPixels: ReturnType<typeof normalizedRectToPixelRect>; scale: number }> {
  const cropPixels = normalizedRectToPixelRect(cropRect, source.width, source.height);
  const scale = Math.max(destination.width / cropPixels.width, destination.height / cropPixels.height);
  const resizedWidth = Math.max(destination.width, Math.max(1, Math.round(cropPixels.width * scale)));
  const resizedHeight = Math.max(destination.height, Math.max(1, Math.round(cropPixels.height * scale)));
  const resized = await sharp(source.data, { raw: { width: source.width, height: source.height, channels: 4 } }).extract({ left: cropPixels.x, top: cropPixels.y, width: cropPixels.width, height: cropPixels.height }).resize(resizedWidth, resizedHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 }).raw().toBuffer();
  const left = horizontalAnchor(anchor, resizedWidth - destination.width);
  const top = verticalAnchor(anchor, resizedHeight - destination.height);
  const rgba = await sharp(resized, { raw: { width: resizedWidth, height: resizedHeight, channels: 4 } }).extract({ left, top, width: destination.width, height: destination.height }).raw().toBuffer();
  return { rgba, cropPixels, scale };
}

function applyMask(imageRgba: Buffer, maskRgba: Buffer, imageRect: typeof MASK_SEMICIRCLE_RIGHT_IMAGE_DESTINATION): Buffer {
  const canvas = Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
  for (let y = 0; y < imageRect.height; y += 1) {
    for (let x = 0; x < imageRect.width; x += 1) {
      const sourceOffset = (y * imageRect.width + x) * 4;
      const canvasOffset = ((imageRect.y + y) * CANVAS_WIDTH + imageRect.x + x) * 4;
      const maskOffset = canvasOffset;
      const alpha = Math.round((channelAt(imageRgba, sourceOffset + 3) * channelAt(maskRgba, maskOffset + 3)) / 255);
      canvas[canvasOffset] = alpha === 0 ? 0 : channelAt(imageRgba, sourceOffset);
      canvas[canvasOffset + 1] = alpha === 0 ? 0 : channelAt(imageRgba, sourceOffset + 1);
      canvas[canvasOffset + 2] = alpha === 0 ? 0 : channelAt(imageRgba, sourceOffset + 2);
      canvas[canvasOffset + 3] = alpha;
    }
  }
  return canvas;
}

function alphaBoundsNormalized(bbox: BBox, width: number, height: number): NormalizedRect {
  return { x: bbox.x / width, y: bbox.y / height, width: bbox.width / width, height: bbox.height / height };
}

function buildLogoPlacement(asset: RendererAssetDescriptor, plan: ImagePlacementPlan, bbox: BBox, sourceWidth: number, sourceHeight: number, scale: number, destination: { x: number; y: number; width: number; height: number }): AppliedImagePlacement {
  return { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: asset.assetId, policy: plan.policy, source: plan.source, destinationRect: destination, appliedScale: scale, appliedAnchor: "CENTER", alphaTrimApplied: true, alphaBounds: alphaBoundsNormalized(bbox, sourceWidth, sourceHeight), changedFromRequestedPlan: false };
}

export async function renderMaskSemicircleRight(request: MaskSemicircleRenderRequest): Promise<LegacyRenderResult> {
  const issues = validateText(request.input.copy);
  let image: Rgba;
  let logo: Rgba | undefined;
  let mask: Rgba;
  try {
    image = await readRgba(request.image.resolvedAsset.bytes, "MASK IMAGE_PRIMARY");
    if (request.logo) logo = await readRgba(request.logo.resolvedAsset.bytes, "MASK LOGO_PRIMARY");
    mask = await readRgba(request.mask.bytes, "MASK_SEMICIRCLE_RIGHT mask");
  } catch (error) {
    issues.push(issue("KBR-IMAGE-DECODE-FAILED", "asset.image_decode_failed", "/assets", { actual: error instanceof Error ? error.message : String(error) }));
    return { bytes: Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png", appliedImagePlacements: [], validation: issues };
  }
  if (mask.width !== CANVAS_WIDTH || mask.height !== CANVAS_HEIGHT) issues.push(issue("KBR-MASK-ASSET-DIGEST-MISMATCH", "mask.asset_dimensions_invalid", "/maskAsset", { actual: { width: mask.width, height: mask.height }, expected: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } }));

  let logoTrim: BBox | null = null;
  let logoScale = 1;
  let resizedLogo: Buffer | undefined;
  let resizedLogoWidth = 0;
  let resizedLogoHeight = 0;
  let logoX = 0;
  let logoY = 0;
  if (request.logo && logo) {
    const logoVisible = meaningfulVisibleBBox(logo.data, logo.width, logo.height);
    if (!logoVisible) issues.push(issue("KBR-LOGO-EMPTY", "asset.logo_empty", "/imagePlacementPlans/LOGO_PRIMARY/assetId", { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: request.logo.asset.assetId }));
    if (opaqueBackgroundSuspected(logo.data, logo.width, logo.height)) issues.push(issue("KBR-LOGO-TRANSPARENT-BACKGROUND-REQUIRED", "asset.logo_transparent_background_required", "/imagePlacementPlans/LOGO_PRIMARY/assetId", { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: request.logo.asset.assetId }));
    logoTrim = logoVisible ? alphaBBoxWithin(logo.data, logo.width, logo.height, MASK_SEMICIRCLE_RIGHT_LOGO_TRIM_THRESHOLD, logoVisible) : null;
    if (!logoTrim) issues.push(issue("KBR-LOGO-EMPTY", "asset.logo_empty", "/imagePlacementPlans/LOGO_PRIMARY/assetId", { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: request.logo.asset.assetId }));
    if (logoTrim) {
      logoScale = Math.min(MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.width / logoTrim.width, MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.height / logoTrim.height);
      if (logoScale > MASK_SEMICIRCLE_RIGHT_MAX_UPSCALE) issues.push(issue("KBR-LOGO-UPSCALE-LIMIT", "asset.logo_upscale_limit", "/imagePlacementPlans/LOGO_PRIMARY/assetId", { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: request.logo.asset.assetId, actual: { scale: logoScale }, expected: { maximumScale: MASK_SEMICIRCLE_RIGHT_MAX_UPSCALE } }));
      else if (logoScale > 1) issues.push({ ...issue("KBR-LOGO-UPSCALE-LIMIT", "asset.logo_upscale_warning", "/imagePlacementPlans/LOGO_PRIMARY/assetId", { imageSlotId: MASK_SEMICIRCLE_RIGHT_LOGO_SLOT_ID, slotRole: "LOGO", assetId: request.logo.asset.assetId, actual: { scale: logoScale }, expected: { recommendedMaximumScale: 1 } }), severity: "WARNING" });
      resizedLogoWidth = Math.max(1, Math.round(logoTrim.width * logoScale));
      resizedLogoHeight = Math.max(1, Math.round(logoTrim.height * logoScale));
      resizedLogo = await sharp(logo.data, { raw: { width: logo.width, height: logo.height, channels: 4 } }).extract({ left: logoTrim.x, top: logoTrim.y, width: logoTrim.width, height: logoTrim.height }).resize(resizedLogoWidth, resizedLogoHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 }).raw().toBuffer();
      logoX = MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.x + Math.floor((MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.width - resizedLogoWidth) / 2);
      logoY = MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.y + Math.floor((MASK_SEMICIRCLE_RIGHT_LOGO_SAFE_BOX.height - resizedLogoHeight) / 2);
    }
  }
  if (issues.some((entry) => entry.severity === "ERROR") || (request.logo && !logoTrim)) return { bytes: Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png", appliedImagePlacements: [], validation: issues };

  const resolvedCropRect = request.image.resolvedSourceCropRect;
  if (!resolvedCropRect) {
    issues.push(issue("KBR-CROP-RECT-REQUIRED", "placement.crop_rect_required", "/imagePlacementPlans/IMAGE_PRIMARY/cropRect", { imageSlotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID, slotRole: "IMAGE", assetId: request.image.asset.assetId }));
    return { bytes: Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png", appliedImagePlacements: [], validation: issues };
  }
  const imageRender = await resizeCover(image, resolvedCropRect, MASK_SEMICIRCLE_RIGHT_IMAGE_DESTINATION, request.image.resolvedPlan.anchor);
  if (issues.some((entry) => entry.severity === "ERROR")) return { bytes: Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png", appliedImagePlacements: [], validation: issues };

  const maskLayer = applyMask(imageRender.rgba, mask.data, MASK_SEMICIRCLE_RIGHT_IMAGE_DESTINATION);
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  context.putImageData(new ImageData(new Uint8ClampedArray(maskLayer.buffer, maskLayer.byteOffset, maskLayer.byteLength), CANVAS_WIDTH, CANVAS_HEIGHT), 0, 0);
  context.textBaseline = "alphabetic";
  context.font = `48px "${FONT_ALIAS_BOLD}"`;
  context.fillStyle = "#4C4C4C";
  context.fillText(request.input.copy.headline ?? "", TEXT_DRAW_X, HEADLINE_BASELINE_Y);
  context.font = `39px "${FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#777777";
  context.fillText(request.input.copy.subcopy ?? "", TEXT_DRAW_X, SUBCOPY_BASELINE_Y);
  if (request.logo && logoTrim && resizedLogo) {
    const logoCanvas = createCanvas(resizedLogoWidth, resizedLogoHeight);
    logoCanvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(resizedLogo.buffer, resizedLogo.byteOffset, resizedLogo.byteLength), resizedLogoWidth, resizedLogoHeight), 0, 0);
    context.drawImage(logoCanvas, logoX, logoY);
  }

  const imagePlacement: AppliedImagePlacement = {
    imageSlotId: MASK_SEMICIRCLE_RIGHT_IMAGE_SLOT_ID,
    slotRole: "IMAGE",
    assetId: request.image.asset.assetId,
    policy: request.image.resolvedPlan.policy,
    source: request.image.resolvedPlan.source,
    ...(request.image.resolvedPlan.cropRect ? { requestedCropRect: request.image.resolvedPlan.cropRect } : {}),
    ...(request.image.resolvedSourceCropRect ? { resolvedSourceCropRect: request.image.resolvedSourceCropRect } : {}),
    resolvedSourceCropPixels: imageRender.cropPixels,
    destinationRect: MASK_SEMICIRCLE_RIGHT_IMAGE_DESTINATION,
    appliedScale: imageRender.scale,
    appliedAnchor: request.image.resolvedPlan.anchor,
    alphaTrimApplied: false,
    maskAssetId: request.mask.assetId,
    maskDigest: request.mask.sha256,
    changedFromRequestedPlan: false,
  };
  const appliedImagePlacements: AppliedImagePlacement[] = [imagePlacement];
  if (request.logo && logo && logoTrim) appliedImagePlacements.push(buildLogoPlacement(request.logo.asset, request.logo.resolvedPlan, logoTrim, logo.width, logo.height, logoScale, { x: logoX, y: logoY, width: resizedLogoWidth, height: resizedLogoHeight }));
  return { bytes: canvas.toBuffer("image/png"), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, mimeType: "image/png", appliedImagePlacements, validation: issues };
}
