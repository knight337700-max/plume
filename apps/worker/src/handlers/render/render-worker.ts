import type { FileObjectRecord } from "../../../../../packages/core/src/modules/asset/upload-session.js";
import type {
  CreativeRepositories,
  CreativeRenderRecord,
  CreativeVersionRecord,
} from "../../../../../packages/core/src/modules/creative/repositories.js";
import type {
  RenderAssetAccess,
  RenderRequest,
  RenderResult,
} from "../../../../../packages/infrastructure/src/render/renderer-adapter.js";

export interface RenderStorageObject {
  readonly bucket: string;
  readonly objectKey: string;
  readonly bytes: number;
  readonly checksumSha256: string;
  readonly etag?: string;
}
export interface RenderStorage {
  put(input: {
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly objectKey: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<RenderStorageObject>;
}
export interface RenderFileObjectStore {
  create(fileObject: FileObjectRecord): Promise<FileObjectRecord>;
}
export interface RenderAssetAccessResolver {
  resolve(
    workspaceId: string,
    version: CreativeVersionRecord,
  ): Promise<readonly RenderAssetAccess[]>;
}
export interface RenderIdempotencyStore {
  get(key: string): Promise<RenderWorkerResult | null>;
  put(key: string, result: RenderWorkerResult): Promise<void>;
}
export interface RenderWorkerInput {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly purpose: RenderRequest["purpose"];
  readonly outputProfile: RenderRequest["outputProfile"];
  readonly assetAccess?: readonly RenderAssetAccess[];
  readonly fontPackageId?: string | null;
  readonly requireCurrentVersion?: boolean;
}
export interface RenderWorkerResult {
  readonly status: "COMPLETED" | "FAILED";
  readonly requestId: string;
  readonly creativeVersionId: string;
  readonly renderResult: RenderResult;
  readonly fileObject?: FileObjectRecord;
  readonly creativeRender?: CreativeRenderRecord;
  readonly error?: Readonly<Record<string, unknown>>;
}
export interface RenderBatchResult {
  readonly status: "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
  readonly items: readonly RenderWorkerResult[];
  readonly completedCount: number;
  readonly failedCount: number;
}

function failure(
  input: Pick<RenderWorkerInput, "requestId" | "creativeVersionId">,
  code: string,
  message: string,
): RenderWorkerResult {
  return {
    status: "FAILED",
    requestId: input.requestId,
    creativeVersionId: input.creativeVersionId,
    renderResult: {
      requestId: input.requestId,
      status: "FAILED",
      outputFileId: null,
      width: null,
      height: null,
      bytes: null,
      checksumSha256: null,
      outputBytes: null,
      warnings: [],
      error: { code, message },
    },
    error: { code, message },
  };
}

export function createInMemoryRenderIdempotencyStore(): RenderIdempotencyStore {
  const results = new Map<string, RenderWorkerResult>();
  return {
    async get(key) {
      return results.get(key) ?? null;
    },
    async put(key, result) {
      results.set(key, result);
    },
  };
}

export function createRenderWorkerHandler(dependencies: {
  readonly creatives: Pick<CreativeRepositories, "getCreative" | "getVersion" | "createRender">;
  readonly renderer: { render(request: RenderRequest): RenderResult };
  readonly storage: RenderStorage;
  readonly files: RenderFileObjectStore;
  readonly assetAccess?: RenderAssetAccessResolver;
  readonly idempotency?: RenderIdempotencyStore;
}) {
  const idempotency = dependencies.idempotency ?? createInMemoryRenderIdempotencyStore();
  let closing = false;
  let active = 0;
  const drainWaiters: (() => void)[] = [];

  const handle = async (input: RenderWorkerInput): Promise<RenderWorkerResult> => {
    if (closing) return failure(input, "WORKER_CLOSED", "Render worker is shutting down");
    active += 1;
    const key = `${input.workspaceId}:${input.requestId}`;
    try {
      const existing = await idempotency.get(key);
      if (existing) return existing;
      const version = await dependencies.creatives.getVersion(
        input.workspaceId,
        input.creativeVersionId,
      );
      if (!version)
        return failure(
          input,
          "CREATIVE_VERSION_NOT_FOUND",
          "Creative version was not found in the workspace",
        );
      if (input.requireCurrentVersion !== false) {
        const creative = await dependencies.creatives.getCreative(
          input.workspaceId,
          version.creativeId,
        );
        if (!creative || creative.currentVersionId !== version.id)
          return failure(
            input,
            "STALE_CREATIVE_VERSION",
            "Render request does not target the current Creative version",
          );
      }
      const assetAccess =
        input.assetAccess ??
        (dependencies.assetAccess
          ? await dependencies.assetAccess.resolve(input.workspaceId, version)
          : []);
      const renderResult = dependencies.renderer.render({
        requestId: input.requestId,
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        purpose: input.purpose,
        creativeDocument: version.documentJson,
        outputProfile: input.outputProfile,
        assetAccess,
        ...(input.fontPackageId === undefined ? {} : { fontPackageId: input.fontPackageId }),
      });
      if (
        renderResult.status !== "COMPLETED" ||
        !renderResult.outputBytes ||
        !renderResult.checksumSha256
      )
        return {
          status: "FAILED",
          requestId: input.requestId,
          creativeVersionId: input.creativeVersionId,
          renderResult,
          error: renderResult.error ?? { code: "RENDER_FAILED", message: "Renderer failed" },
        };
      const objectKey = `renders/${input.workspaceId}/${input.creativeVersionId}/${renderResult.checksumSha256}.png`;
      const stored = await dependencies.storage.put({
        body: renderResult.outputBytes,
        contentType: "image/png",
        objectKey,
        metadata: {
          workspaceId: input.workspaceId,
          creativeVersionId: input.creativeVersionId,
          checksumSha256: renderResult.checksumSha256,
        },
      });
      if (
        stored.checksumSha256 !== renderResult.checksumSha256 ||
        stored.bytes !== renderResult.outputBytes.byteLength
      )
        return failure(
          input,
          "STORAGE_CHECKSUM_MISMATCH",
          "Object storage changed the rendered artifact",
        );
      const createdAt = new Date().toISOString();
      const fileObject = await dependencies.files.create({
        id: `file-render-${renderResult.checksumSha256}`,
        workspaceId: input.workspaceId,
        storageProvider: "S3",
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        originalFilename: `${input.creativeVersionId}.png`,
        mimeType: "image/png",
        bytes: stored.bytes,
        checksumSha256: stored.checksumSha256,
        metadataJson: { ...(renderResult.renderMetadata ?? {}), purpose: input.purpose },
        createdAt,
      });
      const creativeRender = await dependencies.creatives.createRender({
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        renderPurpose: input.purpose,
        fileObjectId: fileObject.id,
        status: "COMPLETED",
        renderConfigJson: {
          outputProfile: input.outputProfile,
          ...(renderResult.renderMetadata ?? {}),
        },
      });
      const result: RenderWorkerResult = {
        status: "COMPLETED",
        requestId: input.requestId,
        creativeVersionId: input.creativeVersionId,
        renderResult,
        fileObject,
        creativeRender,
      };
      await idempotency.put(key, result);
      return result;
    } catch (error) {
      return failure(
        input,
        "RENDER_WORKER_FAILED",
        error instanceof Error ? error.message : "Render worker failed",
      );
    } finally {
      active -= 1;
      if (closing && active === 0) while (drainWaiters.length) drainWaiters.shift()?.();
    }
  };

  const handleBatch = async (inputs: readonly RenderWorkerInput[]): Promise<RenderBatchResult> => {
    const items = await Promise.all(inputs.map((input) => handle(input)));
    const completedCount = items.filter((item) => item.status === "COMPLETED").length;
    return {
      status:
        completedCount === items.length
          ? "COMPLETED"
          : completedCount
            ? "PARTIAL_SUCCESS"
            : "FAILED",
      items,
      completedCount,
      failedCount: items.length - completedCount,
    };
  };

  const close = async (): Promise<void> => {
    closing = true;
    if (active) await new Promise<void>((resolve) => drainWaiters.push(resolve));
  };
  return { handle, handleBatch, close };
}
