import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Job } from "bullmq";
import {
  validateCommandEnvelope,
  type CreativeGeneratePayload,
} from "../../../packages/contracts/src/async.js";
import type {
  CampaignAssetPoolSelectionRecord,
  CampaignRepositories,
} from "../../../packages/core/src/modules/campaign/repositories.js";
import { DurableProjectGenerationPersistence } from "../../../packages/infrastructure/src/db/durable-project-generation-persistence.js";
import type { Sql } from "postgres";
import type { RuntimeJobHandler } from "./runtime-registry.js";

export interface ProjectGenerationExecutionContext {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly assetPoolSnapshot: NonNullable<CreativeGeneratePayload["assetPoolSnapshot"]>;
}

const executionContext = new AsyncLocalStorage<ProjectGenerationExecutionContext>();

function immutableSnapshot(payload: CreativeGeneratePayload) {
  if (!payload.projectId || !payload.assetPoolSnapshot)
    throw Object.assign(new Error("Project generation requires an immutable asset snapshot"), {
      code: "PROJECT_SNAPSHOT_REQUIRED",
    });
  return Object.freeze(
    payload.assetPoolSnapshot.map((item) =>
      Object.freeze({
        assetVersionId: item.assetVersionId,
        productId: item.productId,
        roleCode: item.roleCode,
        source: item.source,
      }),
    ),
  );
}

/**
 * Runs the non-Frozen per-job execution context.  Keeping this seam here
 * lets the queue transport and focused tests prove snapshot isolation without
 * changing the Frozen canonical handler.
 */
export function runProjectGenerationExecutionContext<T>(
  context: ProjectGenerationExecutionContext,
  callback: () => Promise<T> | T,
): Promise<T> | T {
  return executionContext.run(Object.freeze(context), callback);
}

function deterministicId(
  context: ProjectGenerationExecutionContext,
  assetVersionId: string,
  productId: string,
) {
  return createHash("sha256")
    .update(`${context.jobId}:${assetVersionId}:${productId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function projectSelections(
  context: ProjectGenerationExecutionContext,
  productId?: string,
): readonly CampaignAssetPoolSelectionRecord[] {
  const selected = context.assetPoolSnapshot.filter(
    (item) =>
      item.roleCode === "PRODUCT" && (productId === undefined || item.productId === productId),
  );
  if (productId !== undefined && selected.length === 0)
    throw Object.assign(
      new Error("Project snapshot has no Product asset for the requested product"),
      {
        code: "PROJECT_SNAPSHOT_PRODUCT_ASSET_REQUIRED",
      },
    );
  if (productId !== undefined && selected.length !== 1)
    throw Object.assign(
      new Error("Project snapshot has ambiguous Product assets for the requested product"),
      {
        code: "PROJECT_SNAPSHOT_PRODUCT_ASSET_AMBIGUOUS",
      },
    );
  return selected.map((item) => ({
    id: deterministicId(context, item.assetVersionId, item.productId ?? "global"),
    workspaceId: context.workspaceId,
    campaignId: context.campaignId,
    productId: item.productId ?? "",
    assetVersionId: item.assetVersionId,
    roleCode: "PRODUCT",
    status: "SELECTED",
    licenseStatus: "VALID",
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
}

export function createSnapshotAwareCampaignRepositories(
  delegate: CampaignRepositories,
): CampaignRepositories {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      if (property !== "listAssetPoolSelections") return Reflect.get(target, property, receiver);
      return async (workspaceId: string, campaignId: string, productId?: string) => {
        const context = executionContext.getStore();
        if (!context || context.workspaceId !== workspaceId || context.campaignId !== campaignId)
          return target.listAssetPoolSelections(workspaceId, campaignId, productId);
        return projectSelections(context, productId);
      };
    },
  });
}

export function createProjectAwareCreativeGenerateHandler(input: {
  readonly sql: Sql;
  readonly inner: RuntimeJobHandler;
}): RuntimeJobHandler {
  return async (job: Job<unknown>) => {
    const envelope = validateCommandEnvelope(job.data);
    if (envelope.command !== "creative.generate") return input.inner(job);
    const payload = envelope.payload as CreativeGeneratePayload;
    if (!payload.projectId && !payload.assetPoolSnapshot) return input.inner(job);
    if (!payload.briefVersionId)
      throw Object.assign(new Error("Project generation requires a brief version"), {
        code: "PROJECT_BRIEF_VERSION_REQUIRED",
      });
    const assetPoolSnapshot = immutableSnapshot(payload);
    await new DurableProjectGenerationPersistence(input.sql).persist({
      workspaceId: envelope.workspaceId,
      jobId: envelope.jobId,
      payload: { ...payload, assetPoolSnapshot },
    });
    return runProjectGenerationExecutionContext(
      Object.freeze({
        workspaceId: envelope.workspaceId,
        campaignId: payload.campaignId,
        projectId: payload.projectId!,
        jobId: envelope.jobId,
        assetPoolSnapshot,
      }),
      () => input.inner(job),
    );
  };
}
