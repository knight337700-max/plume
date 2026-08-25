import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

import {
  normalizedRectToPixelRect,
  THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID,
  THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID,
  type AppliedImagePlacement,
  type ImageAnchor,
  type ImagePlacementPlan,
  type NormalizedRect,
  type RendererAssetDescriptor,
  type AssetResolverResult,
  type ThumbnailMultiRenderRequest,
} from "@kbr/renderer-contract";
import { koreanEquivalentUnits } from "./text-contract.js";
import type { BBox, ValidationIssue } from "./types.js";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HEADLINE_BASELINE_Y,
  SUBCOPY_BASELINE_Y,
  TEXT_DRAW_X,
} from "./constants.js";

export const THUMBNAIL_MULTI_RIGHT_SLOTS = Object.freeze({
  [THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID]: Object.freeze({
    x: 621,
    y: 43,
    width: 172,
    height: 172,
    rightExclusive: 793,
    bottomExclusive: 215,
    cornerRadiusPx: 12,
  }),
  [THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID]: Object.freeze({
    x: 809,
    y: 43,
    width: 172,
    height: 172,
    rightExclusive: 981,
    bottomExclusive: 215,
    cornerRadiusPx: 12,
  }),
});

export const THUMBNAIL_MULTI_RIGHT_RADIUS = 12;
export const THUMBNAIL_MULTI_RIGHT_TEXT_HARD_RIGHT_EDGE = 588;
export const THUMBNAIL_MULTI_RIGHT_TEXT_MAX_WIDTH = 540;
export const THUMBNAIL_MULTI_RIGHT_TEXT_WARNING_WIDTH = Math.floor(THUMBNAIL_MULTI_RIGHT_TEXT_MAX_WIDTH * 0.9);

type MultiSlot = (typeof THUMBNAIL_MULTI_RIGHT_SLOTS)[keyof typeof THUMBNAIL_MULTI_RIGHT_SLOTS];

function scanVisibleBBox(data: Uint8ClampedArray, width: number, height: number): BBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function measureMultiText(field: "headline" | "subcopy", value: string): { bbox: BBox; occupiedWidthPx: number; rightExclusive: number } | null {
  if (!value) return null;
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const baselineY = field === "headline" ? HEADLINE_BASELINE_Y : SUBCOPY_BASELINE_Y;
  const fontSize = field === "headline" ? 48 : 39;
  const font = field === "headline" ? FONT_ALIAS_BOLD : FONT_ALIAS_REGULAR;
  context.textBaseline = "alphabetic";
  context.font = `${fontSize}px "${font}"`;
  context.fillStyle = "#000000";
  context.fillText(value, TEXT_DRAW_X, baselineY);
  const bbox = scanVisibleBBox(context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (!bbox) return null;
  const rightExclusive = bbox.x + bbox.width;
  return { bbox, occupiedWidthPx: Math.max(0, rightExclusive - TEXT_DRAW_X), rightExclusive };
}

function validateMultiText(copy: ThumbnailMultiRenderRequest["input"]["copy"]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [field, value, maximumUnits] of [
    ["headline", copy.headline ?? "", 12],
    ["subcopy", copy.subcopy ?? "", 15],
  ] as const) {
    const measured = measureMultiText(field, value);
    const path = `/copy/${field}`;
    if (!measured) continue;
    const units = koreanEquivalentUnits(value);
    if (units > maximumUnits) {
      issues.push({
        code: field === "headline" ? "KBR-TEXT-COUNT-HEADLINE-001" : "KBR-TEXT-COUNT-SUBCOPY-001",
        severity: "ERROR",
        path,
        messageKey: field === "headline" ? "text.headline_korean_equivalent_limit" : "text.subcopy_korean_equivalent_limit",
        actual: { koreanEquivalentUnits: units, limit: maximumUnits },
        expected: { maxKoreanEquivalentUnits: maximumUnits },
        bbox: measured.bbox,
      });
    }
    if (measured.occupiedWidthPx > THUMBNAIL_MULTI_RIGHT_TEXT_MAX_WIDTH || measured.rightExclusive > THUMBNAIL_MULTI_RIGHT_TEXT_HARD_RIGHT_EDGE) {
      issues.push({
        code: field === "headline" ? "KBR-TEXT-004" : "KBR-TEXT-005",
        severity: "ERROR",
        path,
        messageKey: field === "headline" ? "text.headline_overflow" : "text.subcopy_overflow",
        actual: { actualWidthPx: measured.occupiedWidthPx, rightExclusive: measured.rightExclusive },
        expected: { maximumWidthPx: THUMBNAIL_MULTI_RIGHT_TEXT_MAX_WIDTH, hardRightEdgeExclusive: THUMBNAIL_MULTI_RIGHT_TEXT_HARD_RIGHT_EDGE },
        bbox: measured.bbox,
      });
    } else if (measured.occupiedWidthPx >= THUMBNAIL_MULTI_RIGHT_TEXT_WARNING_WIDTH) {
      issues.push({
        code: field === "headline" ? "KBR-TEXT-WIDTH-HEADLINE-W001" : "KBR-TEXT-WIDTH-SUBCOPY-W001",
        severity: "WARNING",
        path,
        messageKey: field === "headline" ? "text.headline_width_warning" : "text.subcopy_width_warning",
        actual: { actualWidthPx: measured.occupiedWidthPx, rightExclusive: measured.rightExclusive },
        expected: { warningThresholdPx: THUMBNAIL_MULTI_RIGHT_TEXT_WARNING_WIDTH, maximumWidthPx: THUMBNAIL_MULTI_RIGHT_TEXT_MAX_WIDTH },
        bbox: measured.bbox,
      });
    }
  }
  return issues;
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

function roundedRectangle(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

async function renderSlot(
  slot: MultiSlot,
  asset: RendererAssetDescriptor,
  resolvedAsset: AssetResolverResult,
  plan: ImagePlacementPlan,
  cropRect: NormalizedRect,
): Promise<{ rgba: Buffer; placement: AppliedImagePlacement }> {
  const source = sharp(Buffer.from(resolvedAsset.bytes), { failOn: "error" })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha();
  const raw = await source.raw().toBuffer({ resolveWithObject: true });
  if (!raw.info.width || !raw.info.height || raw.info.channels !== 4) {
    throw new Error("Thumbnail multi source image does not decode to RGBA pixels");
  }

  const cropPixels = normalizedRectToPixelRect(cropRect, raw.info.width, raw.info.height);
  const scale = Math.max(slot.width / cropPixels.width, slot.height / cropPixels.height);
  const resizedWidth = Math.max(slot.width, Math.max(1, Math.round(cropPixels.width * scale)));
  const resizedHeight = Math.max(slot.height, Math.max(1, Math.round(cropPixels.height * scale)));
  const resizedRgba = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .extract({ left: cropPixels.x, top: cropPixels.y, width: cropPixels.width, height: cropPixels.height })
    .resize(resizedWidth, resizedHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();
  const cropLeft = horizontalAnchor(plan.anchor, resizedWidth - slot.width);
  const cropTop = verticalAnchor(plan.anchor, resizedHeight - slot.height);
  const slotRgba = await sharp(resizedRgba, {
    raw: { width: resizedWidth, height: resizedHeight, channels: 4 },
  })
    .extract({ left: cropLeft, top: cropTop, width: slot.width, height: slot.height })
    .raw()
    .toBuffer();

  return {
    rgba: slotRgba,
    placement: {
      imageSlotId: plan.imageSlotId,
      assetId: asset.assetId,
      policy: plan.policy,
      source: plan.source,
      ...(plan.cropRect ? { requestedCropRect: plan.cropRect } : {}),
      resolvedSourceCropRect: cropRect,
      resolvedSourceCropPixels: cropPixels,
      destinationRect: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
      appliedScale: scale,
      appliedAnchor: plan.anchor,
      alphaTrimApplied: false,
      ...(plan.cropCandidateId ? { cropCandidateId: plan.cropCandidateId } : {}),
      changedFromRequestedPlan: false,
    },
  };
}

/**
 * Deterministic two-slot renderer for the C5 THUMBNAIL_MULTI_RIGHT contract.
 * Slot order is part of the contract and is deliberately independent of the
 * order in which plans or assets were supplied by the caller.
 */
export async function renderThumbnailMultiRight(request: ThumbnailMultiRenderRequest): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
  appliedImagePlacements: readonly AppliedImagePlacement[];
  validation?: readonly ValidationIssue[];
}> {
  const slotById = THUMBNAIL_MULTI_RIGHT_SLOTS as Record<string, MultiSlot>;
  const orderedSlots = [THUMBNAIL_MULTI_RIGHT_PRIMARY_SLOT_ID, THUMBNAIL_MULTI_RIGHT_SECONDARY_SLOT_ID];
  const resolved = new Map(request.slots.map((slot) => [slot.imageSlotId, slot]));
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const placements: AppliedImagePlacement[] = [];

  for (const imageSlotId of orderedSlots) {
    const slotRequest = resolved.get(imageSlotId);
    const slot = slotById[imageSlotId];
    if (!slotRequest || !slot) throw new Error(`Missing THUMBNAIL_MULTI_RIGHT slot ${imageSlotId}`);
    const rendered = await renderSlot(slot, slotRequest.asset, slotRequest.resolvedAsset, slotRequest.resolvedPlan, slotRequest.resolvedSourceCropRect);
    const slotCanvas = createCanvas(slot.width, slot.height);
    const slotContext = slotCanvas.getContext("2d");
    slotContext.putImageData(
      new ImageData(new Uint8ClampedArray(rendered.rgba.buffer, rendered.rgba.byteOffset, rendered.rgba.byteLength), slot.width, slot.height),
      0,
      0,
    );
    context.save();
    roundedRectangle(context, slot.x, slot.y, slot.width, slot.height, slot.cornerRadiusPx);
    context.clip();
    context.drawImage(slotCanvas, slot.x, slot.y);
    context.restore();
    placements.push(rendered.placement);
  }

  context.textBaseline = "alphabetic";
  context.font = `48px "${FONT_ALIAS_BOLD}"`;
  context.fillStyle = "#4C4C4C";
  context.fillText(request.input.copy.headline ?? "", TEXT_DRAW_X, HEADLINE_BASELINE_Y);
  context.font = `39px "${FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#777777";
  context.fillText(request.input.copy.subcopy ?? "", TEXT_DRAW_X, SUBCOPY_BASELINE_Y);

  return {
    bytes: canvas.toBuffer("image/png"),
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    mimeType: "image/png",
    appliedImagePlacements: placements,
    validation: validateMultiText(request.input.copy),
  };
}
