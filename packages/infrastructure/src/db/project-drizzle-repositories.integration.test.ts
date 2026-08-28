import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../db/src/testing/reset.js";
import { DrizzleProjectRepositories } from "./project-drizzle-repositories.js";
import { DurableProjectGenerationPersistence } from "./durable-project-generation-persistence.js";
import { DurableAsyncCommandPublisher } from "../async/durable-command-publisher.js";
import { DrizzleProjectContextReaders } from "./project-context-drizzle-repositories.js";
import { createProjectUseCases } from "../../../core/src/modules/project/project-use-cases.js";

const enabled = process.env.RUN_PI_4C0_1_POSTGRES_TEST === "true";
const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";

describe.skipIf(!enabled)("PI-4C0.1 Project SQL durability", () => {
  let sql: Sql;
  const workspaceId = randomUUID();
  const advertiserId = randomUUID();
  const brandId = randomUUID();
  const campaignId = randomUUID();
  const assetId = randomUUID();
  const assetVersionId = randomUUID();
  const briefId = randomUUID();
  const briefVersionId = randomUUID();
  const channelId = randomUUID();
  const productFamilyId = randomUUID();
  const productId = randomUUID();
  const exportRecipeId = randomUUID();
  const formatProfileId = randomUUID();
  const campaignChannelSelectionId = randomUUID();
  const campaignFormatSelectionId = randomUUID();
  const canonicalFormatKey = "kakao-moment-bizboard-1029x258";

  beforeAll(async () => {
    await resetTestDatabase(databaseUrl);
    sql = postgres(databaseUrl, { max: 2, onnotice: () => undefined });
    await sql`INSERT INTO workspace (id, name, slug) VALUES (${workspaceId}, 'PI-4C0.1', 'pi-4c0-1')`;
    await sql`INSERT INTO advertiser (id, workspace_id, name, normalized_name) VALUES (${advertiserId}, ${workspaceId}, 'PI-4C0.1', 'pi-4c0-1')`;
    await sql`INSERT INTO brand (id, workspace_id, advertiser_id, name, normalized_name) VALUES (${brandId}, ${workspaceId}, ${advertiserId}, 'PI-4C0.1', 'pi-4c0-1')`;
    await sql`INSERT INTO campaign (id, workspace_id, brand_id, display_code, name, objective_code, current_step, status) VALUES (${campaignId}, ${workspaceId}, ${brandId}, 'PI4C01', 'Project durability', 'SALES', 'DRAFT', 'DRAFT')`;
    await sql`INSERT INTO product (id, workspace_id, brand_id, name, normalized_name) VALUES (${productId}, ${workspaceId}, ${brandId}, 'PI-4C0.3 product', 'pi-4c0-3-product')`;
    await sql`INSERT INTO channel (id, code, name) VALUES (${channelId}, 'KAKAO_MOMENT', 'Kakao Moment')`;
    await sql`INSERT INTO product_family (id, channel_id, code, name) VALUES (${productFamilyId}, ${channelId}, 'DISPLAY', 'Display')`;
    await sql`INSERT INTO ad_product (id, product_family_id, code, name) VALUES (${productId}, ${productFamilyId}, 'BIZBOARD', 'Bizboard')`;
    await sql`INSERT INTO export_recipe (id, stable_key, version, name, recipe_json) VALUES (${exportRecipeId}, 'pi4c0.3', '1', 'PI-4C0.3', '{}'::jsonb)`;
    await sql`INSERT INTO format_profile (id, channel_id, ad_product_id, export_recipe_id, stable_key, version, name, render_mode, media_type, verification_status, spec_json) VALUES (${formatProfileId}, ${channelId}, ${productId}, ${exportRecipeId}, ${canonicalFormatKey}, '2026.1', 'Bizboard', 'CANONICAL_RENDERER', 'IMAGE', 'VERIFIED', '{}'::jsonb)`;
    await sql`INSERT INTO campaign_channel_selection (id, workspace_id, campaign_id, channel_id) VALUES (${campaignChannelSelectionId}, ${workspaceId}, ${campaignId}, ${channelId})`;
    await sql`INSERT INTO campaign_format_selection (id, workspace_id, campaign_id, campaign_channel_selection_id, format_profile_id) VALUES (${campaignFormatSelectionId}, ${workspaceId}, ${campaignId}, ${campaignChannelSelectionId}, ${formatProfileId})`;
    await sql`INSERT INTO campaign_brief (id, workspace_id, campaign_id) VALUES (${briefId}, ${workspaceId}, ${campaignId})`;
    await sql`INSERT INTO campaign_brief_version (id, workspace_id, campaign_brief_id, version_no, source_kind, content_json, status) VALUES (${briefVersionId}, ${workspaceId}, ${briefId}, 1, 'MANUAL', '{}'::jsonb, 'CONFIRMED')`;
    await sql`UPDATE campaign_brief SET current_version_id = ${briefVersionId}, current_confirmed_version_id = ${briefVersionId} WHERE id = ${briefId}`;
    await sql`INSERT INTO design_asset (id, workspace_id, brand_id, name, asset_type, status, license_status) VALUES (${assetId}, ${workspaceId}, ${brandId}, 'Project logo', 'IMAGE', 'ACTIVE', 'VALID')`;
    await sql`INSERT INTO file_object (id, workspace_id, storage_provider, bucket, object_key, original_filename, mime_type, bytes, checksum_sha256) VALUES (${randomUUID()}, ${workspaceId}, 'TEST', 'test', 'pi4c0.1.png', 'pi4c0.1.png', 'image/png', 1, ${"a".repeat(64)})`;
    const file = await sql<
      { id: string }[]
    >`SELECT id FROM file_object WHERE workspace_id = ${workspaceId} LIMIT 1`;
    await sql`INSERT INTO asset_version (id, workspace_id, design_asset_id, version_no, file_object_id, source_type) VALUES (${assetVersionId}, ${workspaceId}, ${assetId}, 1, ${file[0]!.id}, 'UPLOAD')`;
    await sql`UPDATE design_asset SET current_version_id = ${assetVersionId} WHERE id = ${assetId}`;
    await sql`INSERT INTO campaign_asset (workspace_id, campaign_id, design_asset_id, status, role_code) VALUES (${workspaceId}, ${campaignId}, ${assetId}, 'SELECTED', 'LOGO')`;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("survives repository recreation and enforces atomic revision plus durable asset links", async () => {
    const first = new DrizzleProjectRepositories(sql);
    const created = await first.createProject({
      workspaceId,
      campaignId,
      name: "Persisted project",
    });
    const reference = await first.addAssetReference({
      workspaceId,
      projectId: created.id,
      assetVersionId,
      roleCode: "LOGO",
    });
    const second = new DrizzleProjectRepositories(sql);
    expect(await second.getProject(workspaceId, created.id)).toMatchObject({
      id: created.id,
      revisionNo: 1,
    });
    expect(await second.listAssetReferences(workspaceId, created.id)).toMatchObject([
      { id: reference.id, assetVersionId },
    ]);
    const updated = await second.updateProject(workspaceId, created.id, { name: "Updated" }, 1);
    await expect(
      second.updateProject(workspaceId, created.id, { name: "Stale" }, 1),
    ).rejects.toMatchObject({ code: "REVISION_MISMATCH", statusCode: 412 });
    expect(await second.archiveProject(workspaceId, created.id, updated.revisionNo)).toMatchObject({
      status: "ARCHIVED",
      revisionNo: 3,
    });
  });

  it("retains the frozen Project command context across application-side object recreation", async () => {
    const projects = new DrizzleProjectRepositories(sql);
    const created = await projects.createProject({
      workspaceId,
      campaignId,
      name: "Durable generation project",
    });
    const payload = {
      campaignId,
      briefVersionId,
      productIds: [productId],
      formatProfileIds: [canonicalFormatKey],
      formatBindings: [{ canonicalFormatKey, campaignFormatSelectionId, formatProfileId }],
      variantCountPerProduct: 1,
      generationMode: "MOCK_AI" as const,
      projectId: created.id,
      assetPoolSnapshot: [
        { assetVersionId, productId: null, roleCode: "LOGO", source: "PROJECT" as const },
      ],
    };
    const job = await new DurableAsyncCommandPublisher(sql).enqueue({
      workspaceId,
      command: "creative.generate",
      schemaVersion: 1,
      payload,
    });
    const first = new DurableProjectGenerationPersistence(sql);
    const persisted = await first.persist({ workspaceId, jobId: job.jobId, payload });
    expect(persisted).not.toBeNull();
    const second = new DurableProjectGenerationPersistence(sql);
    const replay = await second.persist({
      workspaceId,
      jobId: job.jobId,
      payload,
    });
    expect(replay).toEqual(persisted);
    const rows = await sql<
      { project_id: string; asset_pool_snapshot_json: unknown; creative_set_id: string | null }[]
    >`SELECT project_id, asset_pool_snapshot_json, creative_set_id FROM generation_request WHERE id = ${persisted!.generationRequestId}`;
    expect(rows[0]).toMatchObject({
      project_id: created.id,
      creative_set_id: null,
    });
    expect(rows[0]?.asset_pool_snapshot_json).toEqual([
      { assetVersionId, productId: null, roleCode: "LOGO", source: "PROJECT" },
    ]);
    expect(persisted!.creativeSetId).toBeNull();
    const commands = await sql<
      { payload_json: unknown }[]
    >`SELECT payload_json FROM outbox_message WHERE message_key = ${job.messageId}`;
    expect(commands[0]?.payload_json).toMatchObject({
      projectId: created.id,
      assetPoolSnapshot: [{ assetVersionId }],
    });
  });

  it("deduplicates concurrent delivery of the same durable Project job", async () => {
    const projects = new DrizzleProjectRepositories(sql);
    const created = await projects.createProject({
      workspaceId,
      campaignId,
      name: "Concurrent durable generation project",
    });
    const payload = {
      campaignId,
      briefVersionId,
      productIds: [productId],
      formatProfileIds: [canonicalFormatKey],
      formatBindings: [{ canonicalFormatKey, campaignFormatSelectionId, formatProfileId }],
      variantCountPerProduct: 1,
      generationMode: "MOCK_AI" as const,
      projectId: created.id,
      assetPoolSnapshot: [
        { assetVersionId, productId: null, roleCode: "LOGO", source: "PROJECT" as const },
      ],
    };
    const job = await new DurableAsyncCommandPublisher(sql).enqueue({
      workspaceId,
      command: "creative.generate",
      schemaVersion: 1,
      payload,
    });
    const [first, second] = await Promise.all([
      new DurableProjectGenerationPersistence(sql).persist({
        workspaceId,
        jobId: job.jobId,
        payload,
      }),
      new DurableProjectGenerationPersistence(sql).persist({
        workspaceId,
        jobId: job.jobId,
        payload,
      }),
    ]);
    expect(first).toEqual(second);
    const rows = await sql<{ requests: number; sets: number }[]>`
      SELECT
        (SELECT count(*)::int FROM generation_request WHERE async_job_id = ${job.jobId}) AS requests,
        (SELECT count(*)::int FROM creative_set WHERE generation_request_id = ${first!.generationRequestId}) AS sets`;
    expect(rows[0]).toEqual({ requests: 1, sets: 0 });
  });

  it("calculates the effective asset pool from durable Campaign and Project SQL context", async () => {
    const projects = new DrizzleProjectRepositories(sql);
    const created = await projects.createProject({
      workspaceId,
      campaignId,
      name: "Effective assets project",
    });
    await projects.addAssetReference({
      workspaceId,
      projectId: created.id,
      assetVersionId,
      roleCode: "LOGO",
    });
    const context = new DrizzleProjectContextReaders(sql);
    const useCases = createProjectUseCases({
      projects,
      campaigns: context,
      assets: context,
    });

    await expect(useCases.effectiveAssets(workspaceId, created.id)).resolves.toEqual([
      expect.objectContaining({
        assetVersionId,
        source: "BOTH",
        inherited: true,
        projectMutable: true,
        eligible: true,
      }),
    ]);
  });
});
