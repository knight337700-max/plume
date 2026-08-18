import {
  INTEGRATION_SCHEMA_VERSION,
  rendererVersion,
  renderWithIntegrationAdapter,
  type LegacyRenderResult,
  type RendererAssetResolver,
  type RendererIntegrationOutputV1,
} from "@plume/renderer-vendor";
import {
  createObjectRightFileBridge,
  type ObjectRightFileBridgeOptions,
} from "./canonical-renderer-file-bridge.js";
import type {
  CanonicalRendererMetadata,
  CanonicalRendererPort,
  CanonicalRendererRequest,
  CanonicalRendererResult,
} from "./canonical-renderer-port.js";
import { buildObjectRightIntegrationInput } from "./object-right-input-builder.js";
import { resolveCanonicalRendererBinding } from "./renderer-bindings.js";

const RENDERER_REPOSITORY = "knight337700-max/plume-renderer" as const;
const RENDERER_COMMIT = "7baa272dd852ed21a09cf369c928571b3f75fd31" as const;

export interface CanonicalRendererAdapterOptions extends ObjectRightFileBridgeOptions {
  readonly workspaceId: string;
  readonly assetResolver: RendererAssetResolver;
}

function metadata(output?: RendererIntegrationOutputV1): CanonicalRendererMetadata {
  return {
    rendererRepository: RENDERER_REPOSITORY,
    rendererCommit: RENDERER_COMMIT,
    rendererIntegrationContract: INTEGRATION_SCHEMA_VERSION,
    rendererRuntimeVersion: rendererVersion(),
    legacyFallbackUsed: false,
    ...(output === undefined ? {} : { rendererIntegrationOutput: output }),
  };
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

export function createCanonicalRendererAdapter(
  options: CanonicalRendererAdapterOptions,
): CanonicalRendererPort {
  const fileBridge = createObjectRightFileBridge(options);
  return {
    async render(request: CanonicalRendererRequest): Promise<CanonicalRendererResult> {
      if (request.workspaceId !== options.workspaceId)
        return failed(request.requestId, "CANONICAL_RENDERER_WORKSPACE_SCOPE_MISMATCH", metadata());

      let integrationOutput: RendererIntegrationOutputV1;
      let outputBytes: Uint8Array | undefined;
      try {
        const binding = resolveCanonicalRendererBinding(request.plumeFormatProfileId);
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
