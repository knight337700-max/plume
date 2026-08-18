import { createCanvas, ImageData } from "@napi-rs/canvas";
import sharp from "sharp";

import {
  normalizedRectToPixelRect,
  THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID,
  type AppliedImagePlacement,
  type AssetResolverResult,
  type ImageAnchor,
  type ImagePlacementPlan,
  type NormalizedRect,
  type RendererAssetDescriptor,
  type RendererIntegrationInputV1,
} from "@kbr/renderer-contract";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HEADLINE_BASELINE_Y,
  SUBCOPY_BASELINE_Y,
  TEXT_DRAW_X,
} from "./constants.js";

export const THUMBNAIL_BOX_RIGHT_SLOT = Object.freeze({
  x: 666,
  y: 36,
  width: 315,
  height: 186,
});

export const THUMBNAIL_BOX_RIGHT_RADIUS = 12;

export type ThumbnailRenderRequest = Readonly<{
  input: Pick<RendererIntegrationInputV1, "copy">;
  asset: RendererAssetDescriptor;
  resolvedAsset: AssetResolverResult;
  resolvedPlan: ImagePlacementPlan;
  resolvedSourceCropRect: NormalizedRect;
}>;

export type ThumbnailRenderResult = Readonly<{
  bytes: Buffer;
  width: number;
  height: number;
  mimeType: "image/png";
  appliedImagePlacement: AppliedImagePlacement;
}>;

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

/**
 * Render the C4 THUMBNAIL_BOX_RIGHT contract. This function intentionally has
 * no alpha trim or placeholder-guide stage: the selected crop is resized to
 * cover IMAGE_PRIMARY and the rounded slot is the only image mask.
 */
export async function renderThumbnailBoxRight(request: ThumbnailRenderRequest): Promise<ThumbnailRenderResult> {
  const { input, asset, resolvedAsset, resolvedPlan, resolvedSourceCropRect } = request;
  const source = sharp(Buffer.from(resolvedAsset.bytes), { failOn: "error" })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha();
  const raw = await source.raw().toBuffer({ resolveWithObject: true });
  const sourceWidth = raw.info.width;
  const sourceHeight = raw.info.height;
  if (!sourceWidth || !sourceHeight || raw.info.channels !== 4) {
    throw new Error("Thumbnail source image does not decode to RGBA pixels");
  }

  const cropPixels = normalizedRectToPixelRect(resolvedSourceCropRect, sourceWidth, sourceHeight);
  const scale = Math.max(
    THUMBNAIL_BOX_RIGHT_SLOT.width / cropPixels.width,
    THUMBNAIL_BOX_RIGHT_SLOT.height / cropPixels.height,
  );
  const resizedWidth = Math.max(THUMBNAIL_BOX_RIGHT_SLOT.width, Math.max(1, Math.round(cropPixels.width * scale)));
  const resizedHeight = Math.max(THUMBNAIL_BOX_RIGHT_SLOT.height, Math.max(1, Math.round(cropPixels.height * scale)));
  const resizedRgba = await sharp(raw.data, {
    raw: { width: sourceWidth, height: sourceHeight, channels: 4 },
  })
    .extract({ left: cropPixels.x, top: cropPixels.y, width: cropPixels.width, height: cropPixels.height })
    .resize(resizedWidth, resizedHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();

  const cropLeft = horizontalAnchor(resolvedPlan.anchor, resizedWidth - THUMBNAIL_BOX_RIGHT_SLOT.width);
  const cropTop = verticalAnchor(resolvedPlan.anchor, resizedHeight - THUMBNAIL_BOX_RIGHT_SLOT.height);
  const slotRgba = await sharp(resizedRgba, {
    raw: { width: resizedWidth, height: resizedHeight, channels: 4 },
  })
    .extract({
      left: cropLeft,
      top: cropTop,
      width: THUMBNAIL_BOX_RIGHT_SLOT.width,
      height: THUMBNAIL_BOX_RIGHT_SLOT.height,
    })
    .raw()
    .toBuffer();

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  const slotCanvas = createCanvas(THUMBNAIL_BOX_RIGHT_SLOT.width, THUMBNAIL_BOX_RIGHT_SLOT.height);
  const slotContext = slotCanvas.getContext("2d");
  slotContext.putImageData(
    new ImageData(new Uint8ClampedArray(slotRgba.buffer, slotRgba.byteOffset, slotRgba.byteLength), THUMBNAIL_BOX_RIGHT_SLOT.width, THUMBNAIL_BOX_RIGHT_SLOT.height),
    0,
    0,
  );
  context.save();
  roundedRectangle(
    context,
    THUMBNAIL_BOX_RIGHT_SLOT.x,
    THUMBNAIL_BOX_RIGHT_SLOT.y,
    THUMBNAIL_BOX_RIGHT_SLOT.width,
    THUMBNAIL_BOX_RIGHT_SLOT.height,
    THUMBNAIL_BOX_RIGHT_RADIUS,
  );
  context.clip();
  context.drawImage(slotCanvas, THUMBNAIL_BOX_RIGHT_SLOT.x, THUMBNAIL_BOX_RIGHT_SLOT.y);
  context.restore();

  context.textBaseline = "alphabetic";
  context.font = `48px "${FONT_ALIAS_BOLD}"`;
  context.fillStyle = "#4C4C4C";
  context.fillText(input.copy.headline ?? "", TEXT_DRAW_X, HEADLINE_BASELINE_Y);
  context.font = `39px "${FONT_ALIAS_REGULAR}"`;
  context.fillStyle = "#777777";
  context.fillText(input.copy.subcopy ?? "", TEXT_DRAW_X, SUBCOPY_BASELINE_Y);

  const appliedImagePlacement: AppliedImagePlacement = {
    imageSlotId: THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID,
    assetId: asset.assetId,
    policy: resolvedPlan.policy,
    source: resolvedPlan.source,
    ...(resolvedPlan.cropRect ? { requestedCropRect: resolvedPlan.cropRect } : {}),
    resolvedSourceCropRect,
    resolvedSourceCropPixels: cropPixels,
    destinationRect: THUMBNAIL_BOX_RIGHT_SLOT,
    appliedScale: scale,
    appliedAnchor: resolvedPlan.anchor,
    alphaTrimApplied: false,
    ...(resolvedPlan.cropCandidateId ? { cropCandidateId: resolvedPlan.cropCandidateId } : {}),
    changedFromRequestedPlan: false,
  };

  return {
    bytes: canvas.toBuffer("image/png"),
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    mimeType: "image/png",
    appliedImagePlacement,
  };
}
