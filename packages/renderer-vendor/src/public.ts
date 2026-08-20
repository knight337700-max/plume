import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export {
  INTEGRATION_SCHEMA_VERSION,
  OBJECT_RIGHT_FORMAT_PROFILE_ID,
  OBJECT_RIGHT_IMAGE_SLOT_ID,
  OBJECT_RIGHT_TEMPLATE_ID,
  renderWithIntegrationAdapter,
} from "@kbr/renderer-contract";
export type {
  AppliedImagePlacement,
  AssetResolverResult,
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
