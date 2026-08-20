import type { AssetResolverResult, RendererAssetResolver } from "@plume/renderer-vendor";

export interface RendererAssetByteStore {
  get(objectKey: string): Promise<Uint8Array>;
}

export interface RendererAssetTokenBinding {
  readonly token: string;
  readonly workspaceId: string;
  readonly fileObjectId: string;
  readonly objectKey: string;
  readonly mimeType: "image/png" | "image/jpeg";
}

export type RendererAssetResolutionErrorCode =
  | "RENDERER_ASSET_REF_TYPE_NOT_ALLOWED"
  | "RENDERER_ASSET_TOKEN_INVALID"
  | "RENDERER_ASSET_TOKEN_UNKNOWN"
  | "RENDERER_ASSET_WORKSPACE_SCOPE_MISMATCH"
  | "RENDERER_ASSET_OBJECT_KEY_INVALID";

export class RendererAssetResolutionError extends Error {
  public constructor(public readonly code: RendererAssetResolutionErrorCode) {
    super(code);
    this.name = "RendererAssetResolutionError";
  }
}

function isOpaqueToken(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u.test(value);
}

function isWorkspaceScopedObjectKey(workspaceId: string, objectKey: string): boolean {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(workspaceId)) return false;
  const prefix = `workspaces/${workspaceId}/`;
  if (!objectKey.startsWith(prefix) || objectKey.includes("\\")) return false;
  const segments = objectKey.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export interface PlumeRendererAssetResolverOptions {
  readonly workspaceId: string;
  readonly storage: RendererAssetByteStore;
  readonly bindings: readonly RendererAssetTokenBinding[];
}

export class PlumeRendererAssetResolver implements RendererAssetResolver {
  private readonly bindings: ReadonlyMap<string, RendererAssetTokenBinding>;

  public constructor(private readonly options: PlumeRendererAssetResolverOptions) {
    const bindings = new Map<string, RendererAssetTokenBinding>();
    for (const binding of options.bindings) {
      if (!isOpaqueToken(binding.token) || bindings.has(binding.token))
        throw new RendererAssetResolutionError("RENDERER_ASSET_TOKEN_INVALID");
      bindings.set(binding.token, Object.freeze({ ...binding }));
    }
    this.bindings = bindings;
  }

  public async resolve(
    assetRef: Readonly<{ type: string; value: string }>,
  ): Promise<AssetResolverResult> {
    if (assetRef.type !== "INTEGRATION_ASSET_TOKEN")
      throw new RendererAssetResolutionError("RENDERER_ASSET_REF_TYPE_NOT_ALLOWED");
    if (!isOpaqueToken(assetRef.value))
      throw new RendererAssetResolutionError("RENDERER_ASSET_TOKEN_INVALID");
    const binding = this.bindings.get(assetRef.value);
    if (!binding) throw new RendererAssetResolutionError("RENDERER_ASSET_TOKEN_UNKNOWN");
    if (binding.workspaceId !== this.options.workspaceId)
      throw new RendererAssetResolutionError("RENDERER_ASSET_WORKSPACE_SCOPE_MISMATCH");
    if (!isWorkspaceScopedObjectKey(this.options.workspaceId, binding.objectKey))
      throw new RendererAssetResolutionError("RENDERER_ASSET_OBJECT_KEY_INVALID");
    return {
      bytes: await this.options.storage.get(binding.objectKey),
      resolvedMimeType: binding.mimeType,
    };
  }
}

export function createPlumeRendererAssetResolver(
  options: PlumeRendererAssetResolverOptions,
): PlumeRendererAssetResolver {
  return new PlumeRendererAssetResolver(options);
}
