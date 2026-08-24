import { createHash } from "node:crypto";
import {
  INTEGRATION_SCHEMA_VERSION,
  rendererVersion,
  renderWithIntegrationAdapter,
  renderThumbnailBoxRight,
  validateThumbnailBoxRightText,
  type FreeformRenderResult,
  type LegacyRenderResult,
  type RendererAssetResolver,
  type RendererIntegrationOutputV1,
} from "@plume/renderer-vendor";
import {
  createObjectRightFileBridge,
  type ObjectRightFileBridgeOptions,
} from "./canonical-renderer-file-bridge.js";
import {
  createCanonicalFreeformRendererBridge,
  type CanonicalFreeformRendererBridge,
  type CanonicalFreeformRendererBridgeOptions,
} from "./canonical-renderer-freeform-bridge.js";
import type {
  CanonicalRendererMetadata,
  CanonicalRendererPort,
  CanonicalRendererRequest,
  CanonicalRendererResult,
} from "./canonical-renderer-port.js";
import { buildObjectRightIntegrationInput } from "./object-right-input-builder.js";
import { buildThumbnailBoxRightIntegrationInput } from "./thumbnail-box-right-input-builder.js";
import {
  KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING,
  OBJECT_RIGHT_FORMAT_BINDING,
  THUMBNAIL_BOX_RIGHT_FORMAT_BINDING,
  type CanonicalRendererBinding,
  resolveCanonicalRendererBinding,
} from "./renderer-bindings.js";

const RENDERER_REPOSITORY = "knight337700-max/plume-renderer" as const;
const RENDERER_COMMIT = "7baa272dd852ed21a09cf369c928571b3f75fd31" as const;

export interface CanonicalRendererAdapterOptions
  extends ObjectRightFileBridgeOptions,
    CanonicalFreeformRendererBridgeOptions {
  readonly workspaceId: string;
  readonly assetResolver: RendererAssetResolver;
  readonly freeformBridge?: CanonicalFreeformRendererBridge;
}

function metadata(
  output?: RendererIntegrationOutputV1,
  freeform?: FreeformRenderResult,
): CanonicalRendererMetadata {
  return {
    rendererRepository: RENDERER_REPOSITORY,
    rendererCommit: RENDERER_COMMIT,
    rendererIntegrationContract: INTEGRATION_SCHEMA_VERSION,
    rendererRuntimeVersion: rendererVersion(),
    legacyFallbackUsed: false,
    ...(output === undefined ? {} : { rendererIntegrationOutput: output }),
    ...(freeform === undefined
      ? {}
      : {
          ...(freeform.formatProfileId === null
            ? {}
            : { formatProfileId: freeform.formatProfileId }),
          ...(freeform.requestFingerprint === null
            ? {}
            : { requestFingerprint: freeform.requestFingerprint }),
          ...(freeform.pixelFingerprint === null
            ? {}
            : { pixelFingerprint: freeform.pixelFingerprint }),
          ...(freeform.renderFingerprint === null
            ? {}
            : { renderFingerprint: freeform.renderFingerprint }),
          ...(freeform.artifactChecksumSha256 === null
            ? {}
            : { artifactChecksumSha256: freeform.artifactChecksumSha256 }),
          ...(freeform.artifactFormat === null ? {} : { artifactFormat: freeform.artifactFormat }),
          appliedElements: freeform.appliedElements,
          rendererWarnings: freeform.warnings,
        }),
  };
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isFreeformBinding(
  binding: CanonicalRendererBinding,
): binding is typeof KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING {
  return binding.layoutMode === "FREEFORM";
}

function isFreeformRequest(
  request: CanonicalRendererRequest,
): request is Extract<CanonicalRendererRequest, { readonly layoutMode: "FREEFORM" }> {
  return "layoutMode" in request && request.layoutMode === "FREEFORM";
}

function failed(
  requestId: string,
  code: string,
  renderMetadata: CanonicalRendererMetadata,
  details: Readonly<Record<string, unknown>> = {},
): CanonicalRendererResult {
  return {
    requestId,
    status: "FAILED",
    outputFileId: null,
    width: null,
    height: null,
    bytes: null,
    checksumSha256: null,
    outputBytes: null,
    renderMetadata,
    warnings: [],
    error: { code, ...details },
  };
}

function freeformFailed(
  requestId: string,
  freeform: FreeformRenderResult,
  code: string,
  details: Readonly<Record<string, unknown>> = {},
): CanonicalRendererResult {
  return failed(requestId, code, metadata(undefined, freeform), {
    rendererValidation: { errors: freeform.errors, warnings: freeform.warnings },
    ...details,
  });
}

export function createCanonicalRendererAdapter(
  options: CanonicalRendererAdapterOptions,
): CanonicalRendererPort {
  const fileBridge = createObjectRightFileBridge(options);
  const freeformBridge = options.freeformBridge ?? createCanonicalFreeformRendererBridge(options);
  return {
    async render(request: CanonicalRendererRequest): Promise<CanonicalRendererResult> {
      if (request.workspaceId !== options.workspaceId)
        return failed(request.requestId, "CANONICAL_RENDERER_WORKSPACE_SCOPE_MISMATCH", metadata());

      let integrationOutput: RendererIntegrationOutputV1;
      let outputBytes: Uint8Array | undefined;
      try {
        const binding = resolveCanonicalRendererBinding(request.plumeFormatProfileId);

        if (isFreeformBinding(binding)) {
          if (!isFreeformRequest(request))
            return failed(
              request.requestId,
              "CANONICAL_RENDERER_LAYOUT_MODE_MISMATCH",
              metadata(),
              {
                expected: "FREEFORM",
                actual: "layoutMode" in request ? request.layoutMode : "TEMPLATE_LOCKED",
              },
            );

          const assets = [];
          for (const asset of request.assets) {
            const resolved = await options.assetResolver.resolve({
              type: "INTEGRATION_ASSET_TOKEN",
              value: asset.token,
            });
            const actualChecksum = checksum(resolved.bytes);
            if (
              resolved.resolvedMimeType !== asset.mimeType ||
              actualChecksum !== asset.checksumSha256.toLowerCase()
            )
              throw Object.assign(new Error("FREEFORM asset identity does not match"), {
                code: "CANONICAL_FREEFORM_ASSET_IDENTITY_MISMATCH",
                assetId: asset.assetId,
                expectedMimeType: asset.mimeType,
                actualMimeType: resolved.resolvedMimeType,
                expectedChecksumSha256: asset.checksumSha256,
                actualChecksumSha256: actualChecksum,
              });
            assets.push({
              assetId: asset.assetId,
              mimeType: asset.mimeType,
              checksumSha256: asset.checksumSha256,
              ...(asset.declaredWidth === undefined ? {} : { declaredWidth: asset.declaredWidth }),
              ...(asset.declaredHeight === undefined
                ? {}
                : { declaredHeight: asset.declaredHeight }),
              bytes: Buffer.from(resolved.bytes),
            });
          }
          const freeform = await freeformBridge({
            formatProfileId: binding.rendererFormatProfileId,
            layoutMode: "FREEFORM",
            creativeLayoutPlan: request.creativeLayoutPlan,
            assets,
            output: request.output,
          });
          if (freeform.status !== "PASS")
            return freeformFailed(
              request.requestId,
              freeform,
              "CANONICAL_FREEFORM_RENDERER_BLOCKED",
            );
          if (!freeform.png || freeform.artifactFormat !== "PNG")
            return freeformFailed(request.requestId, freeform, "CANONICAL_RENDERER_OUTPUT_MISSING");
          const renderedBytes = new Uint8Array(freeform.png);
          const renderedChecksum = checksum(renderedBytes);
          if (
            freeform.artifactChecksumSha256 !== renderedChecksum ||
            freeform.pngDigest !== renderedChecksum ||
            freeform.artifactDigest !== renderedChecksum ||
            freeform.renderFingerprint !== freeform.pixelFingerprint ||
            freeform.formatProfileId !== binding.rendererFormatProfileId
          )
            return freeformFailed(
              request.requestId,
              freeform,
              "CANONICAL_FREEFORM_RENDERER_IDENTITY_MISMATCH",
              { actualChecksumSha256: renderedChecksum },
            );
          if (freeform.errors.length > 0)
            return freeformFailed(
              request.requestId,
              freeform,
              "CANONICAL_FREEFORM_RENDERER_BLOCKED",
            );
          return {
            requestId: request.requestId,
            status: "COMPLETED",
            outputFileId: null,
            width: 1200,
            height: 600,
            bytes: renderedBytes.byteLength,
            checksumSha256: renderedChecksum,
            outputBytes: renderedBytes,
            renderMetadata: metadata(undefined, freeform),
            warnings: freeform.warnings.map(({ code, messageKey }) => `${code}:${messageKey}`),
            error: null,
          };
        }

        if (isFreeformRequest(request))
          return failed(request.requestId, "CANONICAL_RENDERER_LAYOUT_MODE_MISMATCH", metadata(), {
            expected: "TEMPLATE_LOCKED",
            actual: "layoutMode" in request ? request.layoutMode : "FREEFORM",
          });

        if (binding.plumeFormatProfileId === OBJECT_RIGHT_FORMAT_BINDING.plumeFormatProfileId) {
          const input = buildObjectRightIntegrationInput(binding, {
            advertiser: request.advertiser,
            headline: request.headline,
            subcopy: request.subcopy,
            productAsset: request.productAsset,
          });
          integrationOutput = await renderWithIntegrationAdapter(input, {
            resolver: options.assetResolver,
            renderLegacy: async (legacyInput, resolvedAsset): Promise<LegacyRenderResult> => {
              const rendered = await fileBridge(legacyInput, resolvedAsset);
              outputBytes = rendered.bytes.slice();
              return rendered;
            },
          });
        } else if (
          binding.plumeFormatProfileId === THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.plumeFormatProfileId
        ) {
          if (!request.semanticPlacement)
            throw Object.assign(new Error("Semantic placement evidence is required"), {
              code: "SEMANTIC_EVIDENCE_MISSING",
            });
          const input = buildThumbnailBoxRightIntegrationInput(binding, {
            advertiser: request.advertiser,
            headline: request.headline,
            subcopy: request.subcopy,
            productAsset: {
              ...request.productAsset,
              declaredWidth:
                request.productAsset.declaredWidth ?? request.semanticPlacement.source.width,
              declaredHeight:
                request.productAsset.declaredHeight ?? request.semanticPlacement.source.height,
            },
            cropCandidate: request.semanticPlacement.candidate,
            acceptedPlan: request.semanticPlacement.acceptedPlan,
          });
          await validateThumbnailBoxRightText(input.copy);
          integrationOutput = await renderWithIntegrationAdapter(input, {
            resolver: options.assetResolver,
            renderThumbnail: async (thumbnailRequest): Promise<LegacyRenderResult> => {
              const rendered = await renderThumbnailBoxRight(thumbnailRequest);
              outputBytes = rendered.bytes.slice();
              return rendered;
            },
          });
        } else {
          throw Object.assign(
            new Error(
              "No canonical Renderer binding exists for the requested Plume format profile",
            ),
            { code: "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND" },
          );
        }
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : "CANONICAL_RENDERER_EXECUTION_FAILED";
        return failed(request.requestId, code, metadata());
      }

      const renderMetadata = metadata(integrationOutput);
      if (integrationOutput.status !== "PASS")
        return failed(request.requestId, "CANONICAL_RENDERER_BLOCKED", renderMetadata, {
          rendererValidation: integrationOutput.validation,
        });
      if (!integrationOutput.artifact || !outputBytes)
        return failed(request.requestId, "CANONICAL_RENDERER_OUTPUT_MISSING", renderMetadata);

      return {
        requestId: request.requestId,
        status: "COMPLETED",
        outputFileId: null,
        width: integrationOutput.artifact.width,
        height: integrationOutput.artifact.height,
        bytes: integrationOutput.artifact.bytes,
        checksumSha256: integrationOutput.artifact.checksumSha256,
        outputBytes,
        renderMetadata,
        warnings: integrationOutput.validation.warnings.map(
          ({ code, messageKey }) => `${code}:${messageKey}`,
        ),
        error: null,
      };
    },
  };
}
