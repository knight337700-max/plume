import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createKakaoBizboardRenderer,
  getRendererRuntimeRoot,
  OBJECT_RIGHT_IMAGE_SLOT_ID,
  readRenderedManifest,
  type AssetResolverResult,
  type KakaoBizboardInputV1,
  type LegacyObjectRightInput,
  type LegacyRenderResult,
  type RendererValidationIssue,
  type ValidationIssue,
} from "@plume/renderer-vendor";

export interface ObjectRightFileBridgeOptions {
  readonly rendererRuntimeRoot?: string;
  readonly onEphemeralWorkspaceCreated?: (workspacePath: string) => void;
}

export class FrozenRendererCoreError extends Error {
  public readonly code = "FROZEN_RENDERER_CORE_BLOCKED";

  public constructor(public readonly rendererErrorCodes: readonly string[]) {
    super("Frozen Renderer Core blocked the render");
    this.name = "FrozenRendererCoreError";
  }
}

function resolveSafeRelativePath(root: string, relativePath: string): string {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0")
  )
    throw new Error("RENDERER_EPHEMERAL_PATH_INVALID");
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    throw new Error("RENDERER_EPHEMERAL_PATH_INVALID");
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error("RENDERER_EPHEMERAL_PATH_INVALID");
  return resolved;
}

function mapValidationIssue(issue: ValidationIssue): RendererValidationIssue {
  return {
    code: issue.code,
    severity: issue.severity,
    messageKey: issue.messageKey,
    path: issue.path,
    ...(issue.imageSlotId === undefined ? {} : { imageSlotId: issue.imageSlotId }),
    ...(issue.slotRole === undefined ? {} : { slotRole: issue.slotRole }),
    ...(issue.assetId === undefined ? {} : { assetId: issue.assetId }),
    ...(issue.elementId === undefined ? {} : { elementId: issue.elementId }),
    ...(issue.actual === undefined ? {} : { actual: issue.actual }),
    ...(issue.expected === undefined ? {} : { expected: issue.expected }),
  };
}

export type ObjectRightLegacyRendererBridge = (
  input: LegacyObjectRightInput,
  resolvedAsset: AssetResolverResult,
) => Promise<LegacyRenderResult>;

export function createObjectRightFileBridge(
  options: ObjectRightFileBridgeOptions = {},
): ObjectRightLegacyRendererBridge {
  return async (input, resolvedAsset) => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "plume-canonical-renderer-"));
    try {
      options.onEphemeralWorkspaceCreated?.(workspaceRoot);
      const inputRoot = path.join(workspaceRoot, "input");
      const outputRoot = path.join(workspaceRoot, "output");
      await Promise.all([mkdir(inputRoot), mkdir(outputRoot)]);
      const productPath = resolveSafeRelativePath(inputRoot, input.product.relativePath);
      const outputDirectory = resolveSafeRelativePath(outputRoot, input.output.directory);
      resolveSafeRelativePath(outputDirectory, input.output.baseName);
      await mkdir(path.dirname(productPath), { recursive: true });
      await writeFile(productPath, resolvedAsset.bytes, { flag: "wx" });

      const coreInput: KakaoBizboardInputV1 = {
        schemaVersion: "1.2.0",
        channel: input.channel,
        placement: input.placement,
        template: input.template,
        advertiser: { text: input.advertiser, renderMode: "REQUIRE_IN_COPY" },
        copy: input.copy,
        cta: { mode: "NONE", landingType: "DIRECT_URL", label: null, iconPath: null },
        assets: {
          product: {
            path: input.product.relativePath,
            expectedSha256: input.product.expectedSha256,
            alphaTrim: true,
          },
        },
        render: {
          templateContractVersion: "1.3.0",
          includeDebugOverlay: false,
          pixelRatio: 1,
        },
        output: input.output,
        canvas: input.canvas,
      };
      const renderer = await createKakaoBizboardRenderer({
        projectRoot: options.rendererRuntimeRoot ?? getRendererRuntimeRoot(),
        inputRoot,
        outputRoot,
      });
      const response = await renderer.render(coreInput);
      if (response.status !== "PASS" || !response.pngPath)
        throw new FrozenRendererCoreError(response.errors.map(({ code }) => code));
      const [bytes, manifest] = await Promise.all([
        readFile(response.pngPath),
        readRenderedManifest(response),
      ]);
      const validation = manifest?.validatorResult.issues.map(mapValidationIssue) ?? [];
      const assetId = path.posix.basename(
        input.product.relativePath,
        path.posix.extname(input.product.relativePath),
      );
      return {
        bytes: new Uint8Array(bytes),
        width: 1029,
        height: 258,
        mimeType: "image/png",
        appliedImagePlacement: {
          imageSlotId: OBJECT_RIGHT_IMAGE_SLOT_ID,
          assetId,
          policy: "ALPHA_TRIM_CONTAIN",
          source: "DETERMINISTIC",
          destinationRect: { x: 666, y: 0, width: 315, height: 258 },
          appliedScale: 1,
          appliedAnchor: "CENTER",
          alphaTrimApplied: true,
          changedFromRequestedPlan: false,
        },
        validation,
      };
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  };
}
