import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../packages/db/src/testing/reset.js";
import { createInMemoryAssetRepositories } from "../../../packages/core/src/modules/asset/repositories.js";
import { createInMemoryCampaignRepositories } from "../../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryCreativeRepositories } from "../../../packages/core/src/modules/creative/repositories.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { createBullMqAdapter } from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { ObjectStorage } from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createWorkerBootstrap } from "./bootstrap.js";
import { createWorkerRuntimeComposition } from "./composition.js";
import { createRuntimeHandlerRegistry } from "./runtime-registry.js";

const enabled = process.env.RUN_PI_4C0_2_REDIS_TEST === "true";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("WORKER_TRANSPORT_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe.skipIf(!enabled)("PI-4C0.2 Project snapshot WorkerBootstrap transport", () => {
  let sql: Sql;
  let image: Uint8Array;

  beforeAll(async () => {
    await resetTestDatabase(databaseUrl);
    sql = postgres(databaseUrl, { max: 4, onnotice: () => undefined });
    image = new Uint8Array(
      await readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../packages/renderer-vendor/upstream/fixtures/valid/object-right__product__basic__pass.png",
        ),
      ),
    );
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("consumes a durable Project command through BullMQ and uses only its enqueue snapshot", async () => {
    const workspaceId = randomUUID();
    const advertiserId = randomUUID();
    const brandId = randomUUID();
    const campaignId = randomUUID();
    const projectId = randomUUID();
    const briefId = randomUUID();
    const briefVersionId = randomUUID();
    const snapshotAssetId = randomUUID();
    const snapshotAssetVersionId = randomUUID();
    const liveAssetId = randomUUID();
    const liveAssetVersionId = randomUUID();
    const fileObjectId = randomUUID();
    const productId = randomUUID();
    const prefix = `pi4c0-2-${randomUUID()}`;
    const initialSelectionId = randomUUID();

    await sql`INSERT INTO workspace (id, name, slug) VALUES (${workspaceId}, 'PI-4C0.2', ${`pi4c0-2-${workspaceId.slice(0, 8)}`})`;
    await sql`INSERT INTO advertiser (id, workspace_id, name, normalized_name) VALUES (${advertiserId}, ${workspaceId}, 'PI-4C0.2', 'pi-4c0-2')`;
    await sql`INSERT INTO brand (id, workspace_id, advertiser_id, name, normalized_name) VALUES (${brandId}, ${workspaceId}, ${advertiserId}, 'PI-4C0.2', 'pi-4c0-2')`;
    await sql`INSERT INTO campaign (id, workspace_id, brand_id, display_code, name, objective_code, current_step, status) VALUES (${campaignId}, ${workspaceId}, ${brandId}, 'PI4C02', 'Snapshot transport', 'SALES', 'READY', 'DRAFT')`;
    await sql`INSERT INTO campaign_brief (id, workspace_id, campaign_id) VALUES (${briefId}, ${workspaceId}, ${campaignId})`;
    await sql`INSERT INTO campaign_brief_version (id, workspace_id, campaign_brief_id, version_no, source_kind, content_json, status) VALUES (${briefVersionId}, ${workspaceId}, ${briefId}, 1, 'MANUAL', ${JSON.stringify({ creativeCopy: { advertiser: "PLUME", headline: "Snapshot", subcopy: "Frozen before enqueue" } })}::jsonb, 'CONFIRMED')`;
    await sql`UPDATE campaign_brief SET current_version_id = ${briefVersionId}, current_confirmed_version_id = ${briefVersionId} WHERE id = ${briefId}`;
    await sql`INSERT INTO project (id, workspace_id, campaign_id, name, status, revision_no) VALUES (${projectId}, ${workspaceId}, ${campaignId}, 'Transport project', 'ACTIVE', 1)`;
    await sql`INSERT INTO file_object (id, workspace_id, storage_provider, bucket, object_key, original_filename, mime_type, bytes, checksum_sha256) VALUES (${fileObjectId}, ${workspaceId}, 'TEST', 'test', 'snapshot.png', 'snapshot.png', 'image/png', ${image.byteLength}, ${checksum(image)})`;
    for (const [assetId, versionId, name] of [
      [snapshotAssetId, snapshotAssetVersionId, "Snapshot Product"],
      [liveAssetId, liveAssetVersionId, "Live Product"],
    ] as const) {
      await sql`INSERT INTO design_asset (id, workspace_id, brand_id, name, asset_type, status, license_status) VALUES (${assetId}, ${workspaceId}, ${brandId}, ${name}, 'IMAGE', 'ACTIVE', 'VALID')`;
      await sql`INSERT INTO asset_version (id, workspace_id, design_asset_id, version_no, file_object_id, source_type) VALUES (${versionId}, ${workspaceId}, ${assetId}, 1, ${fileObjectId}, 'UPLOAD')`;
    }

    let liveSelectionReads = 0;
    const campaigns = createInMemoryCampaignRepositories({
      campaigns: [
        {
          id: campaignId,
          workspaceId,
          brandId,
          displayCode: "PI4C02",
          name: "Snapshot transport",
          objectiveCode: "SALES",
          status: "DRAFT",
          currentStep: "READY",
          revisionNo: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      briefs: [
        { id: briefId, workspaceId, campaignId, currentVersionId: briefVersionId, revisionNo: 1 },
      ],
      briefVersions: [
        {
          id: briefVersionId,
          workspaceId,
          campaignBriefId: briefId,
          versionNo: 1,
          sourceKind: "MANUAL",
          contentJson: {
            creativeCopy: {
              advertiser: "PLUME",
              headline: "Snapshot",
              subcopy: "Frozen before enqueue",
            },
          },
          sourceCitationsJson: [],
          brandProfileSnapshotJson: {},
          status: "CONFIRMED",
          createdAt: new Date().toISOString(),
        },
      ],
      assetPoolSelections: [
        {
          id: initialSelectionId,
          workspaceId,
          campaignId,
          productId,
          assetVersionId: snapshotAssetVersionId,
          roleCode: "PRODUCT",
          status: "SELECTED",
          licenseStatus: "VALID",
          updatedAt: new Date().toISOString(),
        },
      ],
      formatSelections: [
        {
          id: randomUUID(),
          workspaceId,
          campaignId,
          channelCode: "KAKAO_MOMENT",
          formatProfileId: "kakao-moment-bizboard-1029x258",
          profileVersion: "2026.1",
          status: "SELECTED",
          snapshotJson: {},
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    const campaignRepositories = {
      ...campaigns,
      async listAssetPoolSelections(...args: Parameters<typeof campaigns.listAssetPoolSelections>) {
        liveSelectionReads += 1;
        return campaigns.listAssetPoolSelections(...args);
      },
    };
    const assets = createInMemoryAssetRepositories({
      assets: [
        {
          id: snapshotAssetId,
          workspaceId,
          brandId,
          name: "Snapshot Product",
          assetType: "IMAGE",
          status: "ACTIVE",
          licenseStatus: "VALID",
          analysisSummaryJson: {},
          revisionNo: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: liveAssetId,
          workspaceId,
          brandId,
          name: "Live Product",
          assetType: "IMAGE",
          status: "ACTIVE",
          licenseStatus: "VALID",
          analysisSummaryJson: {},
          revisionNo: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      versions: [
        {
          id: snapshotAssetVersionId,
          workspaceId,
          designAssetId: snapshotAssetId,
          versionNo: 1,
          fileObjectId,
          sourceType: "UPLOAD",
          analysisJson: { alpha: true },
          createdAt: new Date().toISOString(),
        },
        {
          id: liveAssetVersionId,
          workspaceId,
          designAssetId: liveAssetId,
          versionNo: 1,
          fileObjectId,
          sourceType: "UPLOAD",
          analysisJson: { alpha: true },
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const storage: ObjectStorage = {
      createObjectKey: () => "output.png",
      async put(input) {
        return {
          bucket: "test",
          objectKey: input.objectKey ?? "output.png",
          bytes: input.body.byteLength,
          checksumSha256: checksum(input.body),
          etag: checksum(input.body),
        };
      },
      async head() {
        return null;
      },
      async get() {
        return image;
      },
      async presign() {
        return {
          url: "https://storage.invalid",
          expiresAt: new Date().toISOString(),
          method: "GET" as const,
        };
      },
      async deleteTemp() {},
    };
    const adapter = createBullMqAdapter({ redisUrl, prefix });
    const creativeRepositories = createInMemoryCreativeRepositories();
    const composition = createWorkerRuntimeComposition({
      sql,
      adapter,
      storage,
      campaignRepositories,
      assetRepositories: assets,
      creativeRepositories,
      fileObjectReader: {
        async getFileObject(requestWorkspace, requestId) {
          return requestWorkspace === workspaceId && requestId === fileObjectId
            ? {
                id: fileObjectId,
                workspaceId,
                storageProvider: "TEST",
                bucket: "test",
                objectKey: "snapshot.png",
                originalFilename: "snapshot.png",
                mimeType: "image/png",
                bytes: image.byteLength,
                checksumSha256: checksum(image),
                metadataJson: { alpha: true },
                createdAt: new Date().toISOString(),
              }
            : null;
        },
      },
      providerMode: "mock",
    });
    const registry = createRuntimeHandlerRegistry(
      composition.handlers,
      ["creative.generate"],
      ["creative.generate"],
    );
    const bootstrap = createWorkerBootstrap({
      adapter,
      handlers: registry.registrations,
      requiredHandlerTypes: ["creative.generate"],
      readinessChecks: composition.readinessChecks,
    });
    try {
      expect((await bootstrap.start()).status).toBe("ready");
      const command = await new DurableAsyncCommandPublisher(sql).enqueue({
        workspaceId,
        command: "creative.generate",
        schemaVersion: 1,
        payload: {
          campaignId,
          briefVersionId,
          productIds: [productId],
          formatProfileIds: ["kakao-moment-bizboard-1029x258"],
          variantCountPerProduct: 1,
          generationMode: "CANONICAL_RENDERER",
          projectId,
          assetPoolSnapshot: [
            {
              assetVersionId: snapshotAssetVersionId,
              productId,
              roleCode: "PRODUCT",
              source: "PROJECT" as const,
            },
          ],
        },
      });
      await campaigns.upsertAssetPoolSelection({
        id: initialSelectionId,
        workspaceId,
        campaignId,
        productId,
        assetVersionId: snapshotAssetVersionId,
        roleCode: "PRODUCT",
        status: "EXCLUDED",
        licenseStatus: "VALID",
      });
      await campaigns.upsertAssetPoolSelection({
        id: randomUUID(),
        workspaceId,
        campaignId,
        productId,
        assetVersionId: liveAssetVersionId,
        roleCode: "PRODUCT",
        status: "SELECTED",
        licenseStatus: "VALID",
      });
      await composition.outboxDispatcher.flush();
      await eventually(
        async () =>
          (
            await sql<
              { status: string }[]
            >`SELECT status FROM async_job_item WHERE id = ${command.jobItemId}`
          )[0]?.status === "COMPLETED",
      );
      const persisted = await sql<
        { project_id: string; asset_pool_snapshot_json: unknown; creative_set_id: string | null }[]
      >`SELECT project_id, asset_pool_snapshot_json, creative_set_id FROM generation_request WHERE async_job_id = ${command.jobId}`;
      expect(persisted[0]).toMatchObject({
        project_id: projectId,
        creative_set_id: expect.any(String),
      });
      expect(persisted[0]?.asset_pool_snapshot_json).toEqual([
        {
          assetVersionId: snapshotAssetVersionId,
          productId,
          roleCode: "PRODUCT",
          source: "PROJECT",
        },
      ]);
      expect(liveSelectionReads).toBe(0);
      const generatedSet = (
        await creativeRepositories.listCreativeSets(workspaceId, campaignId)
      )[0];
      const generatedCreative = (
        await creativeRepositories.listCreatives(workspaceId, generatedSet?.id)
      )[0];
      const generatedVersion = await creativeRepositories.getVersion(
        workspaceId,
        generatedCreative?.currentVersionId ?? "",
      );
      expect(generatedVersion?.documentJson).toMatchObject({
        usedAssetVersionIds: [snapshotAssetVersionId],
      });
      expect(
        (
          await sql<
            { project_id: string }[]
          >`SELECT project_id FROM creative_set WHERE id = ${persisted[0]!.creative_set_id}`
        )[0]?.project_id,
      ).toBe(projectId);
    } finally {
      await composition.outboxDispatcher.stop();
      await bootstrap.stop();
      await composition.close();
    }
  });
});
