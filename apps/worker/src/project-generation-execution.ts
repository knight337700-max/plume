import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Job } from "bullmq";
import {
  validateCommandEnvelope,
  type CreativeGeneratePayload,
  type CreativeRenderPayload,
} from "../../../packages/contracts/src/async.js";
import type {
  CampaignAssetPoolSelectionRecord,
  CampaignRepositories,
} from "../../../packages/core/src/modules/campaign/repositories.js";
import type { AssetRepositories } from "../../../packages/core/src/modules/asset/repositories.js";
import { DurableProjectGenerationPersistence } from "../../../packages/infrastructure/src/db/durable-project-generation-persistence.js";
import type { Sql } from "postgres";
import type { RuntimeJobHandler } from "./runtime-registry.js";
import { runProjectRenderArtifactContext } from "./project-render-artifact-execution.js";

export interface ProjectGenerationExecutionContext {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly assetPoolSnapshot: NonNullable<CreativeGeneratePayload["assetPoolSnapshot"]>;
}

const executionContext = new AsyncLocalStorage<ProjectGenerationExecutionContext>();

export function currentProjectGenerationExecutionContext():
  | ProjectGenerationExecutionContext
  | undefined {
  return executionContext.getStore();
}

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

/** Routes only active Project canonical reads to PostgreSQL; legacy paths stay unchanged. */
export function createProjectDurableCampaignRepositories(
  delegate: CampaignRepositories,
  durable: Pick<
    CampaignRepositories,
    | "getCampaign"
    | "getBrief"
    | "getBriefVersion"
    | "listFormatSelections"
    | "listCampaignProducts"
    | "listAssetPoolSelections"
  >,
): CampaignRepositories {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      if (
        ![
          "getCampaign",
          "getBrief",
          "getBriefVersion",
          "listFormatSelections",
          "listCampaignProducts",
          "listAssetPoolSelections",
        ].includes(String(property))
      )
        return Reflect.get(target, property, receiver);
      return (...args: readonly unknown[]) => {
        const context = executionContext.getStore();
        const workspaceId = args[0];
        const campaignId = args[1];
        const isVersionLookup = property === "getBriefVersion";
        if (
          !context ||
          workspaceId !== context.workspaceId ||
          (!isVersionLookup && typeof campaignId === "string" && campaignId !== context.campaignId)
        )
          return (
            Reflect.get(target, property, receiver) as (...values: readonly unknown[]) => unknown
          ).apply(target, [...args]);
        return (Reflect.get(durable, property) as (...values: readonly unknown[]) => unknown).apply(
          durable,
          [...args],
        );
      };
    },
  });
}

export function createProjectDurableAssetRepositories(
  delegate: AssetRepositories,
  durable: Pick<AssetRepositories, "getAsset" | "getVersion">,
): AssetRepositories {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      if (property !== "getAsset" && property !== "getVersion")
        return Reflect.get(target, property, receiver);
      return (...args: readonly unknown[]) => {
        const context = executionContext.getStore();
        const targetMethod = Reflect.get(target, property, receiver) as (
          ...values: readonly unknown[]
        ) => unknown;
        const durableMethod = Reflect.get(durable, property) as (
          ...values: readonly unknown[]
        ) => unknown;
        if (!context || args[0] !== context.workspaceId)
          return targetMethod.apply(target, [...args]);
        return durableMethod.apply(durable, [...args]);
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

/** Rehydrates the immutable Project snapshot for a later durable creative.render job. */
export function createProjectAwareCreativeRenderHandler(input: {
  readonly sql: Sql;
  readonly inner: RuntimeJobHandler;
}): RuntimeJobHandler {
  return async (job: Job<unknown>) => {
    const envelope = validateCommandEnvelope(job.data);
    if (envelope.command !== "creative.render") return input.inner(job);
    const payload = envelope.payload as CreativeRenderPayload & { campaignId?: string };
    const rows = await input.sql<
      {
        workspace_id: string;
        campaign_id: string;
        project_id: string | null;
        async_job_id: string;
        asset_pool_snapshot_json: NonNullable<CreativeGeneratePayload["assetPoolSnapshot"]>;
      }[]
    >`SELECT gr.workspace_id, gr.campaign_id, gr.project_id, gr.async_job_id, gr.asset_pool_snapshot_json
      FROM creative_version cv
      JOIN creative c ON c.id = cv.creative_id
      JOIN creative_set cs ON cs.id = c.creative_set_id
      JOIN generation_request gr ON gr.id = cs.generation_request_id
      WHERE cv.workspace_id = ${envelope.workspaceId} AND cv.id = ${payload.creativeVersionId}`;
    const row = rows[0];
    if (!row?.project_id) return input.inner(job);
    if (
      rows.length !== 1 ||
      row.workspace_id !== envelope.workspaceId ||
      (payload.campaignId && payload.campaignId !== row.campaign_id)
    )
      throw Object.assign(new Error("Persisted Project render graph scope mismatch"), {
        code: "PROJECT_RENDER_SCOPE_MISMATCH",
      });
    if (!Array.isArray(row.asset_pool_snapshot_json))
      throw Object.assign(new Error("Persisted Project render snapshot is missing"), {
        code: "PROJECT_RENDER_SNAPSHOT_REQUIRED",
      });
    if (!envelope.jobItemId)
      throw Object.assign(new Error("Project render workflow item is required"), {
        code: "PROJECT_RENDER_JOB_ITEM_REQUIRED",
      });
    const executionContext = Object.freeze({
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      projectId: row.project_id,
      jobId: row.async_job_id,
      assetPoolSnapshot: Object.freeze(
        row.asset_pool_snapshot_json.map((item) => Object.freeze({ ...item })),
      ),
    });
    const artifactContext = Object.freeze({
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      projectId: row.project_id,
      jobId: envelope.jobId,
      jobItemId: envelope.jobItemId,
      messageId: envelope.messageId,
      creativeVersionId: payload.creativeVersionId,
      renderPurpose: payload.purpose,
      mimeType: payload.outputProfile.mimeType,
      width: payload.outputProfile.width,
      height: payload.outputProfile.height,
    });
    return runProjectRenderArtifactContext(artifactContext, () =>
      runProjectGenerationExecutionContext(executionContext, () => input.inner(job)),
    );
  };
}
