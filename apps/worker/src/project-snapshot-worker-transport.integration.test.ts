import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../packages/db/src/testing/reset.js";
import { validateCommandEnvelope } from "../../../packages/contracts/src/async.js";
import { DrizzleCreativeRepositories } from "../../../packages/infrastructure/src/db/creative-drizzle-repositories.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { createBullMqAdapter } from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { ObjectStorage } from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createWorkerBootstrap } from "./bootstrap.js";
import { createWorkerRuntimeComposition } from "./composition.js";
import { createRuntimeHandlerRegistry } from "./runtime-registry.js";

const enabled =
  process.env.RUN_PI_4C0_3_POSTGRES_REDIS_TEST === "true" ||
  process.env.RUN_PI_4C0_2_REDIS_TEST === "true";
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

describe.skipIf(!enabled)("PI-4C0.3 durable Project canonical graph transport", () => {
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
    const channelId = randomUUID();
    const productFamilyId = randomUUID();
    const adProductId = randomUUID();
    const exportRecipeId = randomUUID();
    const durableFormatProfileId = randomUUID();
    const campaignChannelSelectionId = randomUUID();
    const campaignFormatSelectionId = randomUUID();
    const campaignSnapshotAssetId = randomUUID();
    const campaignLiveAssetId = randomUUID();
    const prefix = `pi4c0-2-${randomUUID()}`;
    const objectKey = `workspaces/${workspaceId}/uploads/snapshot.png`;

    await sql`INSERT INTO workspace (id, name, slug) VALUES (${workspaceId}, 'PI-4C0.2', ${`pi4c0-2-${workspaceId.slice(0, 8)}`})`;
    await sql`INSERT INTO advertiser (id, workspace_id, name, normalized_name) VALUES (${advertiserId}, ${workspaceId}, 'PI-4C0.2', 'pi-4c0-2')`;
    await sql`INSERT INTO brand (id, workspace_id, advertiser_id, name, normalized_name) VALUES (${brandId}, ${workspaceId}, ${advertiserId}, 'PI-4C0.2', 'pi-4c0-2')`;
    await sql`INSERT INTO campaign (id, workspace_id, brand_id, display_code, name, objective_code, current_step, status) VALUES (${campaignId}, ${workspaceId}, ${brandId}, 'PI4C02', 'Snapshot transport', 'SALES', 'READY', 'DRAFT')`;
    await sql`INSERT INTO product (id, workspace_id, brand_id, name, normalized_name) VALUES (${productId}, ${workspaceId}, ${brandId}, 'Snapshot product', 'snapshot-product')`;
    await sql`INSERT INTO channel (id, code, name) VALUES (${channelId}, 'KAKAO_MOMENT', 'Kakao Moment')`;
    await sql`INSERT INTO product_family (id, channel_id, code, name) VALUES (${productFamilyId}, ${channelId}, 'DISPLAY', 'Display')`;
    await sql`INSERT INTO ad_product (id, product_family_id, code, name) VALUES (${adProductId}, ${productFamilyId}, 'BIZBOARD', 'Bizboard')`;
    await sql`INSERT INTO export_recipe (id, stable_key, version, name, recipe_json) VALUES (${exportRecipeId}, 'pi4c0.3', '1', 'PI-4C0.3', '{}'::jsonb)`;
    await sql`INSERT INTO format_profile (id, channel_id, ad_product_id, export_recipe_id, stable_key, version, name, render_mode, media_type, verification_status, spec_json) VALUES (${durableFormatProfileId}, ${channelId}, ${adProductId}, ${exportRecipeId}, 'kakao-moment-bizboard-1029x258', '2026.1', 'Bizboard', 'CANONICAL_RENDERER', 'IMAGE', 'VERIFIED', '{}'::jsonb)`;
    await sql`INSERT INTO campaign_channel_selection (id, workspace_id, campaign_id, channel_id) VALUES (${campaignChannelSelectionId}, ${workspaceId}, ${campaignId}, ${channelId})`;
    await sql`INSERT INTO campaign_format_selection (id, workspace_id, campaign_id, campaign_channel_selection_id, format_profile_id) VALUES (${campaignFormatSelectionId}, ${workspaceId}, ${campaignId}, ${campaignChannelSelectionId}, ${durableFormatProfileId})`;
    await sql`INSERT INTO campaign_brief (id, workspace_id, campaign_id) VALUES (${briefId}, ${workspaceId}, ${campaignId})`;
    await sql`INSERT INTO campaign_brief_version (id, workspace_id, campaign_brief_id, version_no, source_kind, content_json, status) VALUES (${briefVersionId}, ${workspaceId}, ${briefId}, 1, 'MANUAL', jsonb_build_object('creativeCopy', jsonb_build_object('advertiser', '자코모', 'headline', '자코모 프리미엄 소파', 'subcopy', '거실을 바꾸는 선택')), 'CONFIRMED')`;
    await sql`UPDATE campaign_brief SET current_version_id = ${briefVersionId}, current_confirmed_version_id = ${briefVersionId} WHERE id = ${briefId}`;
    await sql`INSERT INTO project (id, workspace_id, campaign_id, name, status, revision_no) VALUES (${projectId}, ${workspaceId}, ${campaignId}, 'Transport project', 'ACTIVE', 1)`;
    await sql`INSERT INTO file_object (id, workspace_id, storage_provider, bucket, object_key, original_filename, mime_type, bytes, checksum_sha256) VALUES (${fileObjectId}, ${workspaceId}, 'TEST', 'test', ${objectKey}, 'snapshot.png', 'image/png', ${image.byteLength}, ${checksum(image)})`;
    for (const [assetId, versionId, name] of [
      [snapshotAssetId, snapshotAssetVersionId, "Snapshot Product"],
      [liveAssetId, liveAssetVersionId, "Live Product"],
    ] as const) {
      await sql`INSERT INTO design_asset (id, workspace_id, brand_id, name, asset_type, status, license_status) VALUES (${assetId}, ${workspaceId}, ${brandId}, ${name}, 'IMAGE', 'ACTIVE', 'VALID')`;
      await sql`INSERT INTO asset_version (id, workspace_id, design_asset_id, version_no, file_object_id, source_type, analysis_json) VALUES (${versionId}, ${workspaceId}, ${assetId}, 1, ${fileObjectId}, 'UPLOAD', '{"alpha":true}'::jsonb)`;
      await sql`UPDATE design_asset SET current_version_id = ${versionId} WHERE id = ${assetId}`;
    }
    await sql`INSERT INTO campaign_asset (id, workspace_id, campaign_id, design_asset_id, product_id, status, role_code) VALUES (${campaignSnapshotAssetId}, ${workspaceId}, ${campaignId}, ${snapshotAssetId}, ${productId}, 'SELECTED', 'PRODUCT')`;

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
    let composition: ReturnType<typeof createWorkerRuntimeComposition> | null =
      createWorkerRuntimeComposition({
        sql,
        adapter,
        storage,
        fileObjectReader: {
          async getFileObject(requestWorkspace, requestId) {
            return requestWorkspace === workspaceId && requestId === fileObjectId
              ? {
                  id: fileObjectId,
                  workspaceId,
                  storageProvider: "TEST",
                  bucket: "test",
                  objectKey,
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
      ["creative.generate", "creative.render"],
      ["creative.generate", "creative.render"],
    );
    let bootstrap: ReturnType<typeof createWorkerBootstrap> | null = createWorkerBootstrap({
      adapter,
      handlers: registry.registrations,
      requiredHandlerTypes: ["creative.generate", "creative.render"],
      readinessChecks: composition.readinessChecks,
    });
    let runtimeStopped = false;
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
          formatBindings: [
            {
              canonicalFormatKey: "kakao-moment-bizboard-1029x258",
              campaignFormatSelectionId,
              formatProfileId: durableFormatProfileId,
            },
          ],
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
      await sql`UPDATE campaign_asset SET status = 'EXCLUDED' WHERE id = ${campaignSnapshotAssetId}`;
      await sql`INSERT INTO campaign_asset (id, workspace_id, campaign_id, design_asset_id, product_id, status, role_code) VALUES (${campaignLiveAssetId}, ${workspaceId}, ${campaignId}, ${liveAssetId}, ${productId}, 'SELECTED', 'PRODUCT')`;
      await composition.outboxDispatcher.flush();
      await eventually(
        async () =>
          (
            await sql<
              { status: string }[]
            >`SELECT status FROM async_job_item WHERE id = ${command.jobItemId}`
          )[0]?.status === "COMPLETED",
      );
      await composition.outboxDispatcher.flush();
      await eventually(
        async () =>
          (
            await sql<{ status: string }[]>`SELECT status FROM async_job_item
              WHERE workspace_id = ${workspaceId} AND command = 'creative.render'`
          )[0]?.status === "COMPLETED",
      );
      const persisted = await sql<
        {
          id: string;
          project_id: string;
          asset_pool_snapshot_json: unknown;
          creative_set_id: string | null;
        }[]
      >`SELECT id, project_id, asset_pool_snapshot_json, creative_set_id FROM generation_request WHERE async_job_id = ${command.jobId}`;
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
      await expect(
        sql<{ asset_version_id: string }[]>`SELECT av.id AS asset_version_id
          FROM campaign_asset ca JOIN design_asset da ON da.id = ca.design_asset_id
          JOIN asset_version av ON av.id = da.current_version_id
          WHERE ca.workspace_id = ${workspaceId} AND ca.campaign_id = ${campaignId}
          AND ca.product_id = ${productId} AND ca.status = 'SELECTED'`,
      ).resolves.toEqual([{ asset_version_id: liveAssetVersionId }]);
      const durableCreatives = new DrizzleCreativeRepositories(sql);
      const generatedSet = (await durableCreatives.listCreativeSets(workspaceId, campaignId))[0];
      const generatedCreative = (
        await durableCreatives.listCreatives(workspaceId, generatedSet?.id)
      )[0];
      const generatedVersion = (
        await durableCreatives.listVersions(workspaceId, generatedCreative?.id ?? "")
      )[0];
      expect(generatedVersion?.documentJson).toMatchObject({
        usedAssetVersionIds: [snapshotAssetVersionId],
      });
      await expect(
        sql<{ result_json: { renderer?: { assetVersionId?: string } } }[]>`SELECT result_json
          FROM async_job_item WHERE workspace_id = ${workspaceId} AND command = 'creative.render'`,
      ).resolves.toEqual([
        expect.objectContaining({
          result_json: expect.objectContaining({
            renderer: expect.objectContaining({ assetVersionId: snapshotAssetVersionId }),
          }),
        }),
      ]);
      const durableGraph = await sql<
        {
          creative_sets: number;
          generation_items: number;
          creatives: number;
          versions: number;
          usages: number;
          stored_selection_id: string;
          stored_format_profile_id: string;
          used_asset_version_id: string;
          current_version_id: string | null;
        }[]
      >`SELECT
        (SELECT count(*)::int FROM creative_set cs WHERE cs.generation_request_id = gr.id) AS creative_sets,
        (SELECT count(*)::int FROM generation_request_item gri WHERE gri.generation_request_id = gr.id) AS generation_items,
        (SELECT count(*)::int FROM creative c JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cs.generation_request_id = gr.id) AS creatives,
        (SELECT count(*)::int FROM creative_version cv JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cs.generation_request_id = gr.id) AS versions,
        (SELECT count(*)::int FROM creative_asset_usage cau JOIN creative_version cv ON cv.id = cau.creative_version_id JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cs.generation_request_id = gr.id) AS usages,
        c.campaign_format_selection_id AS stored_selection_id,
        c.current_version_id,
        cv.format_profile_id AS stored_format_profile_id,
        cau.asset_version_id AS used_asset_version_id
        FROM generation_request gr
        JOIN creative_set cs ON cs.id = gr.creative_set_id
        JOIN creative c ON c.creative_set_id = cs.id
        JOIN creative_version cv ON cv.creative_id = c.id
        JOIN creative_asset_usage cau ON cau.creative_version_id = cv.id
        WHERE gr.async_job_id = ${command.jobId}`;
      expect(durableGraph).toEqual([
        expect.objectContaining({
          creative_sets: 1,
          generation_items: 1,
          creatives: 1,
          versions: 1,
          usages: 1,
          stored_selection_id: campaignFormatSelectionId,
          stored_format_profile_id: durableFormatProfileId,
          used_asset_version_id: snapshotAssetVersionId,
          current_version_id: generatedVersion!.id,
        }),
      ]);
      expect(generatedCreative?.currentVersionId).toBe(generatedVersion?.id);
      const sourceMessages = await sql<
        {
          workspace_id: string;
          topic: string;
          message_key: string;
          message_type: string;
          schema_version: number;
          payload_json: Record<string, unknown>;
          headers_json: Record<string, unknown>;
          created_at: Date;
        }[]
      >`SELECT workspace_id, topic, message_key, message_type, schema_version, payload_json, headers_json, created_at
        FROM outbox_message WHERE message_key = ${command.messageId}`;
      const sourceMessage = sourceMessages[0]!;
      const replayEnvelope = validateCommandEnvelope({
        messageId: String(sourceMessage.headers_json.messageId ?? sourceMessage.message_key),
        schemaVersion: sourceMessage.schema_version,
        workspaceId: sourceMessage.workspace_id,
        correlationId: String(sourceMessage.headers_json.correlationId),
        jobId: String(sourceMessage.headers_json.jobId),
        jobItemId: String(sourceMessage.headers_json.jobItemId),
        createdAt: String(
          sourceMessage.headers_json.createdAt ?? sourceMessage.created_at.toISOString(),
        ),
        command: sourceMessage.message_type,
        payload: sourceMessage.payload_json,
      });
      const replay = await adapter.enqueue(sourceMessage.topic, {
        name: sourceMessage.message_type,
        data: replayEnvelope,
        options: { jobId: `replay-${randomUUID()}`, attempts: 1 },
      });
      await eventually(async () => (await replay.getState()) === "completed");
      const afterReplay = await sql<
        {
          generation_requests: number;
          generation_items: number;
          creative_sets: number;
          creatives: number;
          versions: number;
          usages: number;
          creative_set_id: string | null;
          current_version_id: string | null;
        }[]
      >`SELECT
        (SELECT count(*)::int FROM generation_request WHERE async_job_id = ${command.jobId}) AS generation_requests,
        (SELECT count(*)::int FROM generation_request_item WHERE generation_request_id = ${persisted[0]!.id}) AS generation_items,
        (SELECT count(*)::int FROM creative_set WHERE generation_request_id = ${persisted[0]!.id}) AS creative_sets,
        (SELECT count(*)::int FROM creative WHERE creative_set_id = ${generatedSet!.id}) AS creatives,
        (SELECT count(*)::int FROM creative_version WHERE creative_id = ${generatedCreative!.id}) AS versions,
        (SELECT count(*)::int FROM creative_asset_usage WHERE creative_version_id = ${generatedVersion!.id}) AS usages,
        gr.creative_set_id,
        c.current_version_id
        FROM generation_request gr JOIN creative c ON c.id = ${generatedCreative!.id}
        WHERE gr.id = ${persisted[0]!.id}`;
      expect(afterReplay).toEqual([
        {
          generation_requests: 1,
          generation_items: 1,
          creative_sets: 1,
          creatives: 1,
          versions: 1,
          usages: 1,
          creative_set_id: generatedSet!.id,
          current_version_id: generatedVersion!.id,
        },
      ]);
      expect(
        (
          await sql<
            { project_id: string }[]
          >`SELECT project_id FROM creative_set WHERE id = ${persisted[0]!.creative_set_id}`
        )[0]?.project_id,
      ).toBe(projectId);
      const usageRows = await sql<{ id: string }[]>`SELECT cau.id
        FROM creative_asset_usage cau
        JOIN creative_version cv ON cv.id = cau.creative_version_id
        JOIN creative c ON c.id = cv.creative_id
        JOIN creative_set cs ON cs.id = c.creative_set_id
        WHERE cs.generation_request_id = ${persisted[0]!.id}`;
      await composition.outboxDispatcher.stop();
      await bootstrap.stop();
      await composition.close();
      runtimeStopped = true;
      composition = null;
      bootstrap = null;
      await sql.end({ timeout: 5 });
      sql = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
      const recreatedRepositories = new DrizzleCreativeRepositories(sql);
      const recreatedSet = (
        await recreatedRepositories.listCreativeSetsByProject(workspaceId, projectId)
      )[0];
      const recreatedCreative = (
        await recreatedRepositories.listCreatives(workspaceId, recreatedSet?.id)
      )[0];
      const recreatedVersion = await recreatedRepositories.getVersion(
        workspaceId,
        generatedVersion!.id,
      );
      await expect(
        recreatedRepositories.createVersion({
          id: generatedVersion!.id,
          workspaceId,
          creativeId: generatedCreative!.id,
          versionNo: generatedVersion!.versionNo,
          parentVersionId: generatedVersion!.parentVersionId ?? null,
          formatProfileId: generatedVersion!.formatProfileId,
          layoutTemplateId: generatedVersion!.layoutTemplateId ?? null,
          briefVersionId: generatedVersion!.briefVersionId,
          documentJson: generatedVersion!.documentJson,
          copyAssetsJson: generatedVersion!.copyAssetsJson,
          generationMetadataJson: generatedVersion!.generationMetadataJson,
          status: generatedVersion!.status,
          revisionNo: generatedVersion!.revisionNo,
          createdBy: generatedVersion!.createdBy ?? null,
        }),
      ).resolves.toMatchObject({ id: generatedVersion!.id });
      const recreatedUsage = await recreatedRepositories.listAssetUsageGraph(
        workspaceId,
        snapshotAssetVersionId,
      );
      expect(recreatedSet?.id).toBe(generatedSet?.id);
      expect(recreatedCreative).toMatchObject({
        id: generatedCreative!.id,
        currentVersionId: generatedVersion!.id,
      });
      expect(recreatedVersion).toMatchObject({
        id: generatedVersion!.id,
        formatProfileId: "kakao-moment-bizboard-1029x258",
      });
      expect(recreatedUsage).toEqual([
        expect.objectContaining({
          id: usageRows[0]!.id,
          creativeVersionId: generatedVersion!.id,
          projectId,
          assetVersionId: snapshotAssetVersionId,
        }),
      ]);
      await expect(
        sql`SELECT gr.id AS generation_request_id, gr.creative_set_id, cs.project_id,
          c.id AS creative_id, c.current_version_id, cv.id AS creative_version_id,
          cau.id AS asset_usage_id
          FROM generation_request gr
          JOIN creative_set cs ON cs.id = gr.creative_set_id
          JOIN creative c ON c.creative_set_id = cs.id
          JOIN creative_version cv ON cv.id = c.current_version_id
          JOIN creative_asset_usage cau ON cau.creative_version_id = cv.id
          WHERE gr.id = ${persisted[0]!.id}`,
      ).resolves.toHaveLength(1);
      console.info(
        "PI_4C0_3_GRAPH_EVIDENCE",
        JSON.stringify({
          projectId,
          asyncJobId: command.jobId,
          generationRequestId: persisted[0]!.id,
          creativeSetId: generatedSet!.id,
          generationRequestCreativeSetId: persisted[0]!.creative_set_id,
          creativeId: generatedCreative!.id,
          creativeVersionId: generatedVersion!.id,
          assetUsageId: usageRows[0]!.id,
          snapshotAssetVersionId,
          liveAssetVersionId,
          canonicalFormatKey: generatedVersion!.formatProfileId,
          campaignFormatSelectionId,
          durableFormatProfileId,
          creativeSetCount: durableGraph[0]!.creative_sets,
          generationRequestItemCount: durableGraph[0]!.generation_items,
          creativeCount: durableGraph[0]!.creatives,
          creativeVersionCount: durableGraph[0]!.versions,
          assetUsageCount: durableGraph[0]!.usages,
          finalRenderAssetVersionId: snapshotAssetVersionId,
          creativeCurrentVersionId: recreatedCreative!.currentVersionId,
          replayGenerationRequestCount: afterReplay[0]!.generation_requests,
          replayCreativeSetCount: afterReplay[0]!.creative_sets,
          replayCreativeCount: afterReplay[0]!.creatives,
          replayCreativeVersionCount: afterReplay[0]!.versions,
          replayAssetUsageCount: afterReplay[0]!.usages,
          fullRuntimeRecreation: true,
        }),
      );
    } finally {
      if (!runtimeStopped) {
        await composition?.outboxDispatcher.stop();
        await bootstrap?.stop();
        await composition?.close();
      }
    }
  }, 30_000);
});
