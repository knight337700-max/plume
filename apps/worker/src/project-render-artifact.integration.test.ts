import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// This cross-package import is intentional: the integration test proves the API read path against the worker's real SQL graph.
// eslint-disable-next-line no-restricted-imports
import { buildApp } from "../../api/src/app.js";
import {
  validateCommandEnvelope,
  type CreativeRenderPayload,
} from "../../../packages/contracts/src/async.js";
import { resetTestDatabase } from "../../../packages/db/src/testing/reset.js";
import { DurableAsyncCommandPublisher } from "../../../packages/infrastructure/src/async/durable-command-publisher.js";
import { DrizzleCreativeRepositories } from "../../../packages/infrastructure/src/db/creative-drizzle-repositories.js";
import { CreativeRenderArtifactDownload } from "../../../packages/infrastructure/src/db/creative-render-download.js";
import { PostgresUploadSessionRepository } from "../../../packages/infrastructure/src/db/upload-session-repository.js";
import { createBullMqAdapter } from "../../../packages/infrastructure/src/queue/bullmq.js";
import { S3ObjectStorage } from "../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createWorkerBootstrap } from "./bootstrap.js";
import { createWorkerRuntimeComposition } from "./composition.js";
import { createRuntimeHandlerRegistry } from "./runtime-registry.js";

const enabled = process.env.RUN_PI_4C_0_4_RENDER_TEST === "true";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
const s3Endpoint = process.env.S3_ENDPOINT?.trim() || "http://localhost:9000";
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || "plume";
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || "plume_local_only";

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function eventually(
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
  intervalMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("PI_4C_0_4_INTEGRATION_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

interface SeedIds {
  workspaceId: string;
  campaignId: string;
  projectId: string;
  briefVersionId: string;
  productId: string;
  snapshotAssetVersionId: string;
  liveAssetVersionId: string;
  sourceFileObjectId: string;
  sourceObjectKey: string;
  campaignFormatSelectionId: string;
  durableFormatProfileId: string;
  canonicalFormatKey: string;
}

async function seedProjectGraph(sql: Sql, image: Uint8Array): Promise<SeedIds> {
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
  const sourceFileObjectId = randomUUID();
  const productId = randomUUID();
  const channelId = randomUUID();
  const productFamilyId = randomUUID();
  const adProductId = randomUUID();
  const exportRecipeId = randomUUID();
  const durableFormatProfileId = randomUUID();
  const campaignChannelSelectionId = randomUUID();
  const campaignFormatSelectionId = randomUUID();
  const snapshotCampaignAssetId = randomUUID();
  const canonicalFormatKey = "kakao-moment-bizboard-1029x258";
  const sourceObjectKey = `workspaces/${workspaceId}/uploads/source.png`;
  const imageChecksum = checksum(image);

  await sql`INSERT INTO workspace (id, name, slug) VALUES (${workspaceId}, 'PI-4C0.4', ${`pi4c0-4-${workspaceId.slice(0, 8)}`})`;
  await sql`INSERT INTO advertiser (id, workspace_id, name, normalized_name) VALUES (${advertiserId}, ${workspaceId}, 'PI-4C0.4', 'pi-4c-0-4')`;
  await sql`INSERT INTO brand (id, workspace_id, advertiser_id, name, normalized_name) VALUES (${brandId}, ${workspaceId}, ${advertiserId}, 'PI-4C0.4', 'pi-4c-0-4')`;
  await sql`INSERT INTO campaign (id, workspace_id, brand_id, display_code, name, objective_code, current_step, status) VALUES (${campaignId}, ${workspaceId}, ${brandId}, 'PI4C04', 'Renderer artifact read path', 'SALES', 'READY', 'DRAFT')`;
  await sql`INSERT INTO product (id, workspace_id, brand_id, name, normalized_name) VALUES (${productId}, ${workspaceId}, ${brandId}, 'PI-4C0.4 product', 'pi-4c-0-4-product')`;
  await sql`INSERT INTO channel (id, code, name) VALUES (${channelId}, 'KAKAO_MOMENT', 'Kakao Moment')`;
  await sql`INSERT INTO product_family (id, channel_id, code, name) VALUES (${productFamilyId}, ${channelId}, 'DISPLAY', 'Display')`;
  await sql`INSERT INTO ad_product (id, product_family_id, code, name) VALUES (${adProductId}, ${productFamilyId}, 'BIZBOARD', 'Bizboard')`;
  await sql`INSERT INTO export_recipe (id, stable_key, version, name, recipe_json) VALUES (${exportRecipeId}, 'pi4c0.4', '1', 'PI-4C0.4', '{}'::jsonb)`;
  await sql`INSERT INTO format_profile (id, channel_id, ad_product_id, export_recipe_id, stable_key, version, name, render_mode, media_type, verification_status, spec_json) VALUES (${durableFormatProfileId}, ${channelId}, ${adProductId}, ${exportRecipeId}, ${canonicalFormatKey}, '2026.1', 'Bizboard', 'CANONICAL_RENDERER', 'IMAGE', 'VERIFIED', '{}'::jsonb)`;
  await sql`INSERT INTO campaign_channel_selection (id, workspace_id, campaign_id, channel_id) VALUES (${campaignChannelSelectionId}, ${workspaceId}, ${campaignId}, ${channelId})`;
  await sql`INSERT INTO campaign_format_selection (id, workspace_id, campaign_id, campaign_channel_selection_id, format_profile_id) VALUES (${campaignFormatSelectionId}, ${workspaceId}, ${campaignId}, ${campaignChannelSelectionId}, ${durableFormatProfileId})`;
  await sql`INSERT INTO campaign_brief (id, workspace_id, campaign_id) VALUES (${briefId}, ${workspaceId}, ${campaignId})`;
  await sql`INSERT INTO campaign_brief_version (id, workspace_id, campaign_brief_id, version_no, source_kind, content_json, status) VALUES (${briefVersionId}, ${workspaceId}, ${briefId}, 1, 'MANUAL', jsonb_build_object('creativeCopy', jsonb_build_object('advertiser', '자코모', 'headline', '자코모 프리미엄 소파', 'subcopy', '거실을 바꾸는 선택')), 'CONFIRMED')`;
  await sql`UPDATE campaign_brief SET current_version_id = ${briefVersionId}, current_confirmed_version_id = ${briefVersionId} WHERE id = ${briefId}`;
  await sql`INSERT INTO project (id, workspace_id, campaign_id, name, status, revision_no) VALUES (${projectId}, ${workspaceId}, ${campaignId}, 'Renderer artifact project', 'ACTIVE', 1)`;
  await sql`INSERT INTO file_object (id, workspace_id, storage_provider, bucket, object_key, original_filename, mime_type, bytes, checksum_sha256) VALUES (${sourceFileObjectId}, ${workspaceId}, 'S3', 'placeholder', ${sourceObjectKey}, 'source.png', 'image/png', ${image.byteLength}, ${imageChecksum})`;
  for (const [assetId, assetVersionId, name] of [
    [snapshotAssetId, snapshotAssetVersionId, "Snapshot Product"],
    [liveAssetId, liveAssetVersionId, "Live Product"],
  ] as const) {
    await sql`INSERT INTO design_asset (id, workspace_id, brand_id, name, asset_type, status, license_status) VALUES (${assetId}, ${workspaceId}, ${brandId}, ${name}, 'IMAGE', 'ACTIVE', 'VALID')`;
    await sql`INSERT INTO asset_version (id, workspace_id, design_asset_id, version_no, file_object_id, source_type, analysis_json) VALUES (${assetVersionId}, ${workspaceId}, ${assetId}, 1, ${sourceFileObjectId}, 'UPLOAD', '{"alpha":true}'::jsonb)`;
    await sql`UPDATE design_asset SET current_version_id = ${assetVersionId} WHERE id = ${assetId}`;
  }
  await sql`INSERT INTO campaign_asset (id, workspace_id, campaign_id, design_asset_id, product_id, status, role_code) VALUES (${snapshotCampaignAssetId}, ${workspaceId}, ${campaignId}, ${snapshotAssetId}, ${productId}, 'SELECTED', 'PRODUCT')`;
  return {
    workspaceId,
    campaignId,
    projectId,
    briefVersionId,
    productId,
    snapshotAssetVersionId,
    liveAssetVersionId,
    sourceFileObjectId,
    sourceObjectKey,
    campaignFormatSelectionId,
    durableFormatProfileId,
    canonicalFormatKey,
  };
}

function storageFor(bucket: string): S3ObjectStorage {
  return new S3ObjectStorage({
    endpoint: s3Endpoint,
    bucket,
    accessKeyId: s3AccessKeyId,
    secretAccessKey: s3SecretAccessKey,
  });
}

describe.skipIf(!enabled)("PI-4C0.4 durable renderer artifact read path", () => {
  let sql: Sql;
  let image: Uint8Array;

  beforeAll(async () => {
    await resetTestDatabase(databaseUrl);
    sql = postgres(databaseUrl, { max: 10, onnotice: () => undefined });
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

  it("persists, replays, recreates, and securely reads the exact Project renderer artifact", async () => {
    const ids = await seedProjectGraph(sql, image);
    const bucket = `plume-pi4c04-${randomUUID().slice(0, 8)}`;
    const storage = storageFor(bucket);
    await storage.put({
      body: image,
      contentType: "image/png",
      objectKey: ids.sourceObjectKey,
    });
    await sql`UPDATE file_object SET bucket = ${bucket} WHERE id = ${ids.sourceFileObjectId}`;

    const prefix = `pi4c0-4-${randomUUID()}`;
    const adapter = createBullMqAdapter({ redisUrl, prefix });
    let failNextRenderPersistence = false;
    let persistenceFailureObserved = false;
    const composition = createWorkerRuntimeComposition({
      sql,
      adapter,
      storage,
      providerMode: "mock",
      beforeRenderInsert: async () => {
        if (!failNextRenderPersistence) return;
        failNextRenderPersistence = false;
        persistenceFailureObserved = true;
        throw Object.assign(new Error("PI_4C0_4_RENDER_PERSISTENCE_RETRY"), {
          code: "PI_4C0_4_RENDER_PERSISTENCE_RETRY",
          retryable: true,
        });
      },
    });
    const registry = createRuntimeHandlerRegistry(
      composition.handlers,
      ["creative.generate", "creative.render"],
      ["creative.generate", "creative.render"],
    );
    const bootstrap = createWorkerBootstrap({
      adapter,
      handlers: registry.registrations,
      requiredHandlerTypes: ["creative.generate", "creative.render"],
      readinessChecks: composition.readinessChecks,
    });
    try {
      expect((await bootstrap.start()).status).toBe("ready");
      await composition.outboxDispatcher.start();
      const publisher = new DurableAsyncCommandPublisher(sql);
      const command = await publisher.enqueue({
        workspaceId: ids.workspaceId,
        command: "creative.generate",
        schemaVersion: 1,
        payload: {
          campaignId: ids.campaignId,
          briefVersionId: ids.briefVersionId,
          productIds: [ids.productId],
          formatProfileIds: [ids.canonicalFormatKey],
          formatBindings: [
            {
              canonicalFormatKey: ids.canonicalFormatKey,
              campaignFormatSelectionId: ids.campaignFormatSelectionId,
              formatProfileId: ids.durableFormatProfileId,
            },
          ],
          variantCountPerProduct: 1,
          generationMode: "CANONICAL_RENDERER" as const,
          projectId: ids.projectId,
          assetPoolSnapshot: [
            {
              assetVersionId: ids.snapshotAssetVersionId,
              productId: ids.productId,
              roleCode: "PRODUCT",
              source: "PROJECT" as const,
            },
          ],
        },
      });
      await sql`UPDATE campaign_asset SET status = 'EXCLUDED' WHERE workspace_id = ${ids.workspaceId} AND campaign_id = ${ids.campaignId} AND status = 'SELECTED'`;
      await sql`INSERT INTO campaign_asset (workspace_id, campaign_id, design_asset_id, product_id, status, role_code) SELECT ${ids.workspaceId}, ${ids.campaignId}, da.id, ${ids.productId}, 'SELECTED', 'PRODUCT' FROM design_asset da JOIN asset_version av ON av.design_asset_id = da.id WHERE av.id = ${ids.liveAssetVersionId}`;
      await composition.outboxDispatcher.flush();
      await eventually(async () => {
        const rows = await sql<
          { status: string }[]
        >`SELECT status FROM async_job_item WHERE id = ${command.jobItemId}`;
        return rows[0]?.status === "COMPLETED";
      });
      await eventually(async () => {
        const rows = await sql<
          { status: string }[]
        >`SELECT status FROM async_job_item WHERE async_job_id = ${command.jobId} AND command = 'creative.render'`;
        return rows.length === 1 && rows[0]?.status === "COMPLETED";
      });

      const generation = await sql<
        {
          id: string;
          project_id: string | null;
          asset_pool_snapshot_json: unknown;
          creative_set_id: string | null;
        }[]
      >`SELECT id, project_id, asset_pool_snapshot_json, creative_set_id FROM generation_request WHERE async_job_id = ${command.jobId}`;
      expect(generation).toHaveLength(1);
      expect(generation[0]).toMatchObject({
        project_id: ids.projectId,
        creative_set_id: expect.any(String),
      });
      expect(generation[0]?.asset_pool_snapshot_json).toEqual([
        {
          assetVersionId: ids.snapshotAssetVersionId,
          productId: ids.productId,
          roleCode: "PRODUCT",
          source: "PROJECT",
        },
      ]);

      const graph = await sql<
        {
          generation_requests: number;
          generation_items: number;
          creative_sets: number;
          creatives: number;
          versions: number;
          usages: number;
          renders: number;
          creative_set_id: string | null;
          current_version_id: string | null;
          used_asset_version_id: string;
        }[]
      >`SELECT
        (SELECT count(*)::int FROM generation_request WHERE async_job_id = ${command.jobId}) AS generation_requests,
        (SELECT count(*)::int FROM generation_request_item gri JOIN generation_request gr ON gr.id = gri.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS generation_items,
        (SELECT count(*)::int FROM creative_set cs JOIN generation_request gr ON gr.id = cs.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS creative_sets,
        (SELECT count(*)::int FROM creative c JOIN creative_set cs ON cs.id = c.creative_set_id JOIN generation_request gr ON gr.id = cs.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS creatives,
        (SELECT count(*)::int FROM creative_version cv JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id JOIN generation_request gr ON gr.id = cs.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS versions,
        (SELECT count(*)::int FROM creative_asset_usage cau JOIN creative_version cv ON cv.id = cau.creative_version_id JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id JOIN generation_request gr ON gr.id = cs.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS usages,
        (SELECT count(*)::int FROM creative_render cr JOIN creative_version cv ON cv.id = cr.creative_version_id JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id JOIN generation_request gr ON gr.id = cs.generation_request_id WHERE gr.async_job_id = ${command.jobId}) AS renders,
        gr.creative_set_id,
        c.current_version_id,
        cau.asset_version_id AS used_asset_version_id
      FROM generation_request gr
      JOIN creative_set cs ON cs.id = gr.creative_set_id
      JOIN creative c ON c.creative_set_id = cs.id
      JOIN creative_version cv ON cv.creative_id = c.id
      JOIN creative_asset_usage cau ON cau.creative_version_id = cv.id
      WHERE gr.async_job_id = ${command.jobId}`;
      expect(graph).toEqual([
        expect.objectContaining({
          generation_requests: 1,
          generation_items: 1,
          creative_sets: 1,
          creatives: 1,
          versions: 1,
          usages: 1,
          renders: 1,
          used_asset_version_id: ids.snapshotAssetVersionId,
          current_version_id: expect.any(String),
        }),
      ]);
      const versionId = graph[0]!.current_version_id!;
      const initialRenderRows = await sql<
        { id: string; file_object_id: string; render_config_json: Record<string, unknown> }[]
      >`SELECT id, file_object_id, render_config_json FROM creative_render WHERE creative_version_id = ${versionId}`;
      expect(initialRenderRows).toHaveLength(1);
      expect(initialRenderRows[0]!.render_config_json).toMatchObject({
        objectKey: expect.stringContaining(`renders/${ids.workspaceId}/`),
        renderMode: "CANONICAL_RENDERER",
      });
      const renderId = initialRenderRows[0]!.id;
      const fileObjectId = initialRenderRows[0]!.file_object_id;
      const storedFile = await sql<
        { object_key: string; bytes: number; checksum_sha256: string; bucket: string }[]
      >`SELECT object_key, bytes::int, checksum_sha256, bucket FROM file_object WHERE id = ${fileObjectId}`;
      expect(storedFile).toHaveLength(1);
      expect(storedFile[0]!.object_key).toBe(initialRenderRows[0]!.render_config_json.objectKey);
      expect(await storage.head(storedFile[0]!.object_key)).toMatchObject({
        objectKey: storedFile[0]!.object_key,
        bytes: storedFile[0]!.bytes,
      });

      const renderOutbox = await sql<
        {
          topic: string;
          message_key: string;
          message_type: string;
          schema_version: number;
          payload_json: CreativeRenderPayload;
          headers_json: Record<string, unknown>;
          created_at: Date;
        }[]
      >`SELECT topic, message_key, message_type, schema_version, payload_json, headers_json, created_at FROM outbox_message WHERE message_type = 'creative.render' AND headers_json->>'jobId' = ${command.jobId} ORDER BY created_at, message_key`;
      expect(renderOutbox).toHaveLength(1);
      const renderMessage = renderOutbox[0]!;
      const renderEnvelope = validateCommandEnvelope({
        messageId: String(renderMessage.headers_json.messageId ?? renderMessage.message_key),
        schemaVersion: renderMessage.schema_version,
        workspaceId: ids.workspaceId,
        correlationId: String(renderMessage.headers_json.correlationId),
        jobId: String(renderMessage.headers_json.jobId),
        jobItemId: String(renderMessage.headers_json.jobItemId),
        createdAt: String(
          renderMessage.headers_json.createdAt ?? renderMessage.created_at.toISOString(),
        ),
        command: renderMessage.message_type,
        payload: renderMessage.payload_json,
      });
      const replay = await adapter.enqueue(renderMessage.topic, {
        name: renderMessage.message_type,
        data: renderEnvelope,
        options: { jobId: `replay-${randomUUID()}`, attempts: 1 },
      });
      await eventually(async () => (await replay.getState()) === "completed");
      expect(
        await sql`SELECT id FROM creative_render WHERE creative_version_id = ${versionId}`,
      ).toHaveLength(1);

      failNextRenderPersistence = true;
      const distinct = await publisher.enqueue({
        workspaceId: ids.workspaceId,
        command: "creative.render",
        schemaVersion: 1,
        jobId: command.jobId,
        correlationId: command.jobId,
        payload: renderMessage.payload_json,
      });
      await composition.outboxDispatcher.flush();
      await eventually(async () => persistenceFailureObserved);
      expect(
        await sql`SELECT id FROM creative_render WHERE creative_version_id = ${versionId}`,
      ).toHaveLength(1);
      expect(await storage.head(storedFile[0]!.object_key)).toMatchObject({
        objectKey: storedFile[0]!.object_key,
        bytes: storedFile[0]!.bytes,
      });
      const failedDistinctItem = await sql<{ status: string }[]>`
        SELECT status FROM async_job_item WHERE id = ${distinct.jobItemId}
      `;
      expect(failedDistinctItem[0]?.status).not.toBe("COMPLETED");
      await eventually(
        async () => {
          const rows = await sql<
            { status: string }[]
          >`SELECT status FROM async_job_item WHERE id = ${distinct.jobItemId}`;
          return rows[0]?.status === "COMPLETED";
        },
        30_000,
        250,
      );
      expect(
        await sql`SELECT id FROM creative_render WHERE creative_version_id = ${versionId}`,
      ).toHaveLength(2);

      const replayAgain = await adapter.enqueue(renderMessage.topic, {
        name: renderMessage.message_type,
        data: renderEnvelope,
        options: { jobId: `replay-again-${randomUUID()}`, attempts: 1 },
      });
      await eventually(async () => (await replayAgain.getState()) === "completed");
      const countsAfterReplay = await sql<
        { renders: number; files: number; usages: number; creatives: number; versions: number }[]
      >`SELECT
        (SELECT count(*)::int FROM creative_render WHERE creative_version_id = ${versionId}) AS renders,
        (SELECT count(*)::int FROM file_object WHERE workspace_id = ${ids.workspaceId} AND object_key LIKE ${`renders/${ids.workspaceId}/%`}) AS files,
        (SELECT count(*)::int FROM creative_asset_usage WHERE creative_version_id = ${versionId}) AS usages,
        (SELECT count(*)::int FROM creative c JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cs.generation_request_id = ${generation[0]!.id}) AS creatives,
        (SELECT count(*)::int FROM creative_version WHERE creative_id = (SELECT c.id FROM creative c JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cs.generation_request_id = ${generation[0]!.id}) ) AS versions`;
      expect(countsAfterReplay).toEqual([
        { renders: 2, files: 1, usages: 1, creatives: 1, versions: 1 },
      ]);

      await composition.outboxDispatcher.stop();
      await bootstrap.stop();
      await composition.close();
      await sql.end({ timeout: 5 });
      sql = postgres(databaseUrl, { max: 8, onnotice: () => undefined });

      const freshCreativeRepositories = new DrizzleCreativeRepositories(sql);
      const freshSet = (await freshCreativeRepositories.listCreativeSets(ids.workspaceId))[0]!;
      const freshCreative = (
        await freshCreativeRepositories.listCreatives(ids.workspaceId, freshSet.id)
      )[0]!;
      const freshVersion = await freshCreativeRepositories.getVersion(ids.workspaceId, versionId);
      const freshRenders = await freshCreativeRepositories.listRenders(ids.workspaceId, versionId);
      expect(freshCreative.currentVersionId).toBe(versionId);
      expect(freshVersion?.id).toBe(versionId);
      expect(freshVersion?.formatProfileId).toBe(ids.canonicalFormatKey);
      expect(freshRenders).toHaveLength(2);
      const freshStorage = storageFor(bucket);
      const freshFileObjects = new PostgresUploadSessionRepository(sql);
      const download = new CreativeRenderArtifactDownload({
        creativeRepositories: freshCreativeRepositories,
        fileObjects: freshFileObjects,
        storage: freshStorage,
      });
      const app = await buildApp({
        securityMode: "test",
        creativeRepositories: freshCreativeRepositories,
        renderArtifactDownloads: download,
      });
      const listed = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${ids.workspaceId}/creative-versions/${versionId}/renders`,
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().items).toHaveLength(2);
      const downloadResponse = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${ids.workspaceId}/creative-versions/${versionId}/renders/${renderId}/download-url`,
      });
      expect(downloadResponse.statusCode).toBe(200);
      const signed = downloadResponse.json().data as { url: string; filename: string };
      expect(signed.filename).toContain("renderer-");
      const downloadedBytes = new Uint8Array(await (await fetch(signed.url)).arrayBuffer());
      expect(checksum(downloadedBytes)).toBe(storedFile[0]!.checksum_sha256);
      expect(downloadedBytes.byteLength).toBe(storedFile[0]!.bytes);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/workspaces/${randomUUID()}/creative-versions/${versionId}/renders/${renderId}/download-url`,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/workspaces/${ids.workspaceId}/creative-versions/${randomUUID()}/renders/${renderId}/download-url`,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/workspaces/${ids.workspaceId}/creative-versions/${versionId}/renders/${randomUUID()}/download-url`,
          })
        ).statusCode,
      ).toBe(404);
      await sql`UPDATE file_object SET object_key = ${`renders/${ids.workspaceId}/../unsafe.png`} WHERE id = ${fileObjectId}`;
      const unsafe = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${ids.workspaceId}/creative-versions/${versionId}/renders/${renderId}/download-url`,
      });
      expect(unsafe.statusCode).toBe(422);
      await sql`UPDATE file_object SET object_key = ${storedFile[0]!.object_key} WHERE id = ${fileObjectId}`;
      await app.close();

      const genericUploads = (
        await import("../../../packages/core/src/modules/asset/upload-use-cases.js")
      ).createUploadUseCases({
        repository: freshFileObjects,
        storage: freshStorage,
        bucket,
        filePolicy: {
          allowedMimeTypes: ["image/png"],
          maxBytes: 10_000_000,
          maxPixels: 10_000_000,
        },
      });
      const genericApp = await buildApp({ securityMode: "test", uploads: genericUploads });
      const generic = await genericApp.inject({
        method: "GET",
        url: `/api/v1/workspaces/${ids.workspaceId}/files/${ids.sourceFileObjectId}/download-url`,
      });
      expect(generic.statusCode).toBe(200);
      expect(
        (
          await genericApp.inject({
            method: "GET",
            url: `/api/v1/workspaces/${ids.workspaceId}/files/${fileObjectId}/download-url`,
          })
        ).statusCode,
      ).toBe(404);
      await genericApp.close();
      console.info(
        "PI_4C_0_4_RENDER_ARTIFACT_EVIDENCE",
        JSON.stringify({
          workspaceId: ids.workspaceId,
          projectId: ids.projectId,
          jobId: command.jobId,
          generationRequestId: generation[0]!.id,
          generationRequestItemCount: 1,
          creativeSetId: generation[0]!.creative_set_id,
          creativeId: freshCreative.id,
          creativeVersionId: versionId,
          creativeCurrentVersionId: freshCreative.currentVersionId,
          renderIds: freshRenders.map((item) => item.id),
          renderCount: freshRenders.length,
          fileObjectId,
          fileObjectChecksumSha256: storedFile[0]!.checksum_sha256,
          fileObjectBytes: storedFile[0]!.bytes,
          snapshotAssetVersionId: ids.snapshotAssetVersionId,
          liveAssetVersionId: ids.liveAssetVersionId,
          renderedSnapshotAssetVersionId: ids.snapshotAssetVersionId,
          duplicateReplayRenderCount: 2,
          persistenceFailureThenRetry: persistenceFailureObserved,
          processRepositoryApiRecreation: true,
          crossWorkspaceDenied: true,
          wrongVersionDenied: true,
          unsafeObjectKeyDenied: true,
          genericDownloadRegression: true,
        }),
      );
    } finally {
      await composition.outboxDispatcher.stop().catch(() => undefined);
      await bootstrap.stop().catch(() => undefined);
      await composition.close().catch(() => undefined);
      await adapter.close().catch(() => undefined);
    }
  }, 75_000);
});
