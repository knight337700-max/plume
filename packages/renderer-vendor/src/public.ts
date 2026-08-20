import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  INTEGRATION_SCHEMA_VERSION,
  NORMALIZED_EPSILON,
  OBJECT_RIGHT_FORMAT_PROFILE_ID,
  OBJECT_RIGHT_IMAGE_SLOT_ID,
  OBJECT_RIGHT_TEMPLATE_ID,
  THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
  THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID,
  THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,
  canonicalJson,
  renderWithIntegrationAdapter,
  normalizedRectToPixelRect,
  validateNormalizedPoint,
  validateNormalizedRect,
  validatePlacementPlan,
  validateProtectedSubjects,
} from "@kbr/renderer-contract";
export type {
  AppliedImagePlacement,
  AssetResolverResult,
  CropCandidate,
  ImagePlacementPlan,
  NormalizedPoint,
  NormalizedRect,
  PixelRect,
  ProtectedSubject,
  RendererAssetDescriptor,
  LegacyObjectRightInput,
  LegacyRenderResult,
  RendererAssetResolver,
  RendererIntegrationInputV1,
  RendererIntegrationOutputV1,
  RendererValidationIssue,
} from "@kbr/renderer-contract";
// eslint-disable-next-line no-restricted-imports -- This is the sole public boundary over the pinned upstream Core.
export {
  createKakaoBizboardRenderer,
  readRenderedManifest,
  rendererVersion,
} from "../upstream/src/core/renderer.js";
// eslint-disable-next-line no-restricted-imports -- Frozen Thumbnail renderer is exposed through this public boundary.
export {
  renderThumbnailBoxRight,
  THUMBNAIL_BOX_RIGHT_RADIUS,
  THUMBNAIL_BOX_RIGHT_SLOT,
} from "../upstream/src/core/index.js";
// eslint-disable-next-line no-restricted-imports -- Frozen image inspection is exposed through this wrapper.
export { inspectImageBytes } from "../upstream/src/core/image-input.js";
// eslint-disable-next-line no-restricted-imports -- Pinned upstream image metadata is exposed only through this public boundary.
export type { ImageInputMetadata } from "../upstream/src/core/image-input.js";
// eslint-disable-next-line no-restricted-imports -- Pinned upstream types are exposed only through this public boundary.
export type {
  KakaoBizboardInputV1,
  InternalPreviewResult,
  LayoutMeasurements,
  RenderManifest,
  RenderResponse,
  ValidationIssue,
} from "../upstream/src/core/types.js";

const runtimeRootCandidates = [
  fileURLToPath(new URL("../upstream/", import.meta.url)),
  fileURLToPath(new URL("../../upstream/", import.meta.url)),
];

export function getRendererRuntimeRoot(): string {
  const runtimeRoot = runtimeRootCandidates.find((candidate) =>
    existsSync(path.join(candidate, "contracts", "input.schema.json")),
  );
  if (!runtimeRoot) throw new Error("RENDERER_VENDOR_RUNTIME_ROOT_MISSING");
  return runtimeRoot;
}
