import sharp, { type Sharp } from "sharp";

import type {
  GoogleStaticAssetProfile,
  GoogleStaticContracts,
  GoogleStaticPlacementPolicy,
} from "@kbr/renderer-contract";

import { canonicalJson } from "./canonical.js";
import { sha256Bytes } from "./hash.js";
import { resolveGoogleStaticProfile } from "./google-static.js";

export type GoogleStaticPixelRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type GoogleStaticRgbaColor = Readonly<{
  r: number;
  g: number;
  b: number;
  alpha: number;
}>;

export type GoogleStaticCandidateRenderPlan = Readonly<{
  profileId: string;
  placementPolicy: GoogleStaticPlacementPolicy;
  sourceRect?: GoogleStaticPixelRect;
  destinationRect: GoogleStaticPixelRect;
  background: GoogleStaticRgbaColor;
  /** Required for uploaded display static: placement is explicit, never inferred. */
  explicitElementPlan?: boolean;
  /** Required for semantic crop: the crop rectangle is supplied by the plan. */
  semanticPlan?: boolean;
  outputFormat: "PNG" | "JPEG";
  jpegQuality?: number;
}>;

export type GoogleStaticCandidateRenderResult = Readonly<{
  profileId: string;
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg";
  bytes: Buffer;
  encodedBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceRect: GoogleStaticPixelRect;
  renderedRect: GoogleStaticPixelRect;
  alphaTrimmed: boolean;
  sourceSha256: string;
  renderFingerprint: string;
}>;

export class GoogleStaticRenderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleStaticRenderError";
    this.code = code;
  }
}

type RawRgba = Readonly<{
  data: Buffer;
  width: number;
  height: number;
}>;

const PNG_ENCODER = Object.freeze({
  compressionLevel: 9,
  adaptiveFiltering: false,
  palette: false,
});

const JPEG_ENCODER = Object.freeze({
  chromaSubsampling: "4:2:0" as const,
  progressive: false,
  mozjpeg: false,
});

function fail(code: string, message: string): never {
  throw new GoogleStaticRenderError(code, message);
}

function finiteInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value);
}

function assertRect(rect: GoogleStaticPixelRect, label: string, bounds?: { width: number; height: number }): void {
  if (![rect.x, rect.y, rect.width, rect.height].every(finiteInteger) || rect.width < 1 || rect.height < 1 || rect.x < 0 || rect.y < 0) {
    fail("KBR-G2-PLAN-RECT-INVALID", `${label} must contain non-negative integer coordinates and positive dimensions`);
  }
  if (bounds && (rect.x + rect.width > bounds.width || rect.y + rect.height > bounds.height)) {
    fail("KBR-G2-PLAN-RECT_OUT_OF_BOUNDS", `${label} exceeds its source or canvas bounds`);
  }
}

function assertColor(color: GoogleStaticRgbaColor): void {
  if (![color.r, color.g, color.b, color.alpha].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    fail("KBR-G2-PLAN-BACKGROUND_INVALID", "background channels must be integers in the range 0..255");
  }
}

async function decodeRgba(bytes: Buffer): Promise<RawRgba> {
  try {
    const decoded = await sharp(bytes, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
  } catch {
    fail("KBR-G2-SOURCE-DECODE-FAILED", "source fixture is not a decodable image");
  }
}

function alphaTrimRect(raw: RawRgba): GoogleStaticPixelRect {
  let minX = raw.width;
  let minY = raw.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raw.height; y += 1) {
    for (let x = 0; x < raw.width; x += 1) {
      if ((raw.data[(y * raw.width + x) * 4 + 3] ?? 0) >= 1) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: raw.width, height: raw.height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function roleFamily(profile: GoogleStaticAssetProfile): "marketing" | "logo" | "uploaded" {
  if (profile.role === "LOGO" || profile.role === "LANDSCAPE_LOGO") return "logo";
  if (profile.role === "UPLOADED_DISPLAY_STATIC") return "uploaded";
  return "marketing";
}

function validatePlan(profile: GoogleStaticAssetProfile, plan: GoogleStaticCandidateRenderPlan, source: RawRgba): void {
  if (plan.profileId !== profile.profileId) fail("KBR-G2-PLAN-PROFILE-MISMATCH", "render plan profileId does not match the selected profile");
  if (plan.outputFormat !== "PNG" && plan.outputFormat !== "JPEG") fail("KBR-G2-FORMAT-UNSUPPORTED", "outputFormat must be PNG or JPEG");
  assertRect(plan.destinationRect, "destinationRect", profile.projectOutputPreset);
  assertColor(plan.background);
  if (plan.sourceRect) assertRect(plan.sourceRect, "sourceRect", { width: source.width, height: source.height });
  const family = roleFamily(profile);
  if (family === "logo" && ["MANUAL_CROP", "SEMANTIC_CROP_COVER"].includes(plan.placementPolicy)) {
    fail("KBR-G2-LOGO-CROP-FORBIDDEN", "logo candidates cannot use a crop placement policy");
  }
  if (family === "marketing" && plan.placementPolicy === "ALPHA_TRIM_CONTAIN") {
    fail("KBR-G2-MARKETING-ALPHA-TRIM-FORBIDDEN", "marketing image candidates cannot use alpha trim");
  }
  if (family === "uploaded" && (!plan.explicitElementPlan || plan.placementPolicy !== "NONE")) {
    fail("KBR-G2-UPLOADED-PLAN-REQUIRED", "uploaded display static candidates require an explicit element plan and NONE policy");
  }
  if (["MANUAL_CROP", "SEMANTIC_CROP_COVER"].includes(plan.placementPolicy) && !plan.sourceRect) {
    fail("KBR-G2-CROP-RECT-REQUIRED", "crop policies require an explicit sourceRect");
  }
  if (plan.placementPolicy === "SEMANTIC_CROP_COVER" && !plan.semanticPlan) {
    fail("KBR-G2-SEMANTIC-PLAN-REQUIRED", "semantic crop requires an explicit semantic plan");
  }
  const uploadedNonePolicy = family === "uploaded" && plan.placementPolicy === "NONE";
  if (!uploadedNonePolicy && !profile.allowedPlacementPolicies.includes(plan.placementPolicy)) {
    fail("KBR-G2-PLACEMENT-POLICY-INVALID", `placement policy ${plan.placementPolicy} is not allowed for ${profile.profileId}`);
  }
}

function backgroundRaw(width: number, height: number, color: GoogleStaticRgbaColor): Buffer {
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const grid = x % 96 === 0 || y % 96 === 0;
      output[index] = edge ? 38 : grid ? Math.max(0, color.r - 10) : color.r;
      output[index + 1] = edge ? 48 : grid ? Math.max(0, color.g - 10) : color.g;
      output[index + 2] = edge ? 62 : grid ? Math.max(0, color.b - 10) : color.b;
      output[index + 3] = color.alpha;
    }
  }
  return output;
}

function fitContain(source: GoogleStaticPixelRect, destination: GoogleStaticPixelRect): GoogleStaticPixelRect {
  const scale = Math.min(destination.width / source.width, destination.height / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  return {
    x: destination.x + Math.floor((destination.width - width) / 2),
    y: destination.y + Math.floor((destination.height - height) / 2),
    width,
    height,
  };
}

async function encodeCanvas(canvas: Sharp, format: "PNG" | "JPEG", quality: number | undefined): Promise<Buffer> {
  if (format === "PNG") return canvas.png(PNG_ENCODER).toBuffer();
  const resolvedQuality = quality ?? 88;
  if (!Number.isInteger(resolvedQuality) || resolvedQuality < 1 || resolvedQuality > 100) fail("KBR-G2-JPEG-QUALITY-INVALID", "JPEG quality must be an integer in the range 1..100");
  return canvas.jpeg({ ...JPEG_ENCODER, quality: resolvedQuality }).toBuffer();
}

/**
 * Render one deterministic Google candidate from a local fixture and explicit
 * placement plan.  This is intentionally a small G2 laboratory path: it
 * never resolves fonts, network assets, platform copy, or Google UI chrome.
 */
export async function renderGoogleStaticCandidate(
  sourceBytes: Buffer,
  plan: GoogleStaticCandidateRenderPlan,
  contracts: GoogleStaticContracts,
): Promise<GoogleStaticCandidateRenderResult> {
  const profile = resolveGoogleStaticProfile(plan.profileId, contracts);
  if (!profile) fail("KBR-G2-PROFILE-UNKNOWN", `unknown Google static profile: ${plan.profileId}`);
  const source = await decodeRgba(sourceBytes);
  validatePlan(profile, plan, source);
  const sourceBounds = { x: 0, y: 0, width: source.width, height: source.height } as const;
  const alphaTrimmed = plan.placementPolicy === "ALPHA_TRIM_CONTAIN";
  const sourceRect = plan.sourceRect ?? (alphaTrimmed ? alphaTrimRect(source) : sourceBounds);
  const crop = sharp(source.data, { raw: { width: source.width, height: source.height, channels: 4 } }).extract({
    left: sourceRect.x,
    top: sourceRect.y,
    width: sourceRect.width,
    height: sourceRect.height,
  });
  const destination = plan.destinationRect;
  let renderedRect = destination;
  let resized: Sharp;
  if (plan.placementPolicy === "CENTER_CONTAIN" || plan.placementPolicy === "ALPHA_TRIM_CONTAIN") {
    renderedRect = fitContain(sourceRect, destination);
    resized = crop.resize(renderedRect.width, renderedRect.height, { fit: "fill", kernel: "nearest" });
  } else {
    resized = crop.resize(destination.width, destination.height, { fit: "fill", kernel: "nearest" });
  }
  const canvas = sharp(backgroundRaw(profile.projectOutputPreset.width, profile.projectOutputPreset.height, plan.background), {
    raw: { width: profile.projectOutputPreset.width, height: profile.projectOutputPreset.height, channels: 4 },
  }).composite([{ input: await resized.png(PNG_ENCODER).toBuffer(), left: renderedRect.x, top: renderedRect.y }]);
  const bytes = await encodeCanvas(canvas, plan.outputFormat, plan.jpegQuality);
  const sourceSha256 = sha256Bytes(sourceBytes);
  const renderFingerprint = sha256Bytes(canonicalJson({
    profileId: profile.profileId,
    sourceSha256,
    placementPolicy: plan.placementPolicy,
    sourceRect,
    destinationRect: destination,
    renderedRect,
    background: plan.background,
    explicitElementPlan: plan.explicitElementPlan ?? false,
    semanticPlan: plan.semanticPlan ?? false,
    outputFormat: plan.outputFormat,
    jpegQuality: plan.outputFormat === "JPEG" ? (plan.jpegQuality ?? 88) : null,
    encoder: plan.outputFormat === "PNG" ? PNG_ENCODER : JPEG_ENCODER,
  }));
  return {
    profileId: profile.profileId,
    width: profile.projectOutputPreset.width,
    height: profile.projectOutputPreset.height,
    mime: plan.outputFormat === "PNG" ? "image/png" : "image/jpeg",
    bytes,
    encodedBytes: bytes.byteLength,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceRect,
    renderedRect,
    alphaTrimmed,
    sourceSha256,
    renderFingerprint,
  };
}
