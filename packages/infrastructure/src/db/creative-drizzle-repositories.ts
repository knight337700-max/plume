import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Sql } from "postgres";
import {
  createInMemoryCreativeRepositories,
  type AssetUsageGraphRecord,
  type CreativeAssetUsageRecord,
  type CreativeRecord,
  type CreativeRenderRecord,
  type CreativeRepositories,
  type CreativeSeed,
  type CreativeSetRecord,
  type CreativeVersionRecord,
} from "../../../core/src/modules/creative/repositories.js";
import { parseCreativeDocument } from "../../../core/src/modules/creative/creative-document.js";

const jsonb = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8");
const iso = (value: Date) => value.toISOString();
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);

export interface ProjectCreativeExecutionContext {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly projectId: string;
  readonly jobId: string;
}

type SetRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  project_id: string | null;
  name: string;
  generation_request_id: string | null;
  status: CreativeSetRecord["status"];
  revision_no: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};
type CreativeRow = {
  id: string;
  workspace_id: string;
  creative_set_id: string;
  campaign_id: string;
  product_id: string | null;
  campaign_format_selection_id: string;
  current_version_id: string | null;
  status: CreativeRecord["status"];
  revision_no: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};
type VersionRow = {
  id: string;
  workspace_id: string;
  creative_id: string;
  version_no: number;
  parent_version_id: string | null;
  stable_key: string;
  layout_template_id: string | null;
  brief_version_id: string;
  document_json: unknown;
  copy_assets_json: Record<string, unknown>;
  generation_metadata_json: Record<string, unknown>;
  status: CreativeVersionRecord["status"];
  revision_no: number;
  created_by: string | null;
  created_at: Date;
  frozen_at: Date | null;
};

const setRecord = (row: SetRow): CreativeSetRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  campaignId: row.campaign_id,
  projectId: row.project_id,
  name: row.name,
  generationRequestId: row.generation_request_id,
  status: row.status,
  revisionNo: row.revision_no,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
});
const creativeRecord = (row: CreativeRow): CreativeRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  creativeSetId: row.creative_set_id,
  campaignId: row.campaign_id,
  productId: row.product_id,
  campaignFormatSelectionId: row.campaign_format_selection_id,
  currentVersionId: row.current_version_id,
  status: row.status,
  revisionNo: row.revision_no,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
});
const versionRecord = (row: VersionRow): CreativeVersionRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  creativeId: row.creative_id,
  versionNo: row.version_no,
  parentVersionId: row.parent_version_id,
  // Core/Frozen code observes the canonical catalog key, never the SQL UUID.
  formatProfileId: row.stable_key,
  layoutTemplateId: row.layout_template_id,
  briefVersionId: row.brief_version_id,
  documentJson: parseCreativeDocument(row.document_json),
  copyAssetsJson: row.copy_assets_json,
  generationMetadataJson: row.generation_metadata_json,
  status: row.status,
  revisionNo: row.revision_no,
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  frozenAt: row.frozen_at ? iso(row.frozen_at) : null,
});

/** SQL-first Project creative graph adapter. Legacy non-Project calls keep their delegate. */
export class DrizzleCreativeRepositories implements CreativeRepositories {
  private readonly delegate: CreativeRepositories;
  public constructor(
    private readonly sql: Sql,
    seed: CreativeSeed = {},
    private readonly projectContext: () => ProjectCreativeExecutionContext | undefined = () =>
      undefined,
    delegate?: CreativeRepositories,
  ) {
    this.delegate = delegate ?? createInMemoryCreativeRepositories(seed);
  }

  private async set(workspaceId: string, id: string): Promise<CreativeSetRecord | null> {
    if (!isUuid(id)) return null;
    const rows = await this.sql<
      SetRow[]
    >`SELECT id, workspace_id, campaign_id, project_id, name, generation_request_id, status, revision_no, created_at, updated_at, deleted_at FROM creative_set WHERE workspace_id = ${workspaceId} AND id = ${id}`;
    return rows[0] && !rows[0].deleted_at ? setRecord(rows[0]) : null;
  }
  private async creative(workspaceId: string, id: string): Promise<CreativeRecord | null> {
    if (!isUuid(id)) return null;
    const rows = await this.sql<
      CreativeRow[]
    >`SELECT id, workspace_id, creative_set_id, campaign_id, product_id, campaign_format_selection_id, current_version_id, status, revision_no, created_at, updated_at, deleted_at FROM creative WHERE workspace_id = ${workspaceId} AND id = ${id}`;
    return rows[0] && !rows[0].deleted_at ? creativeRecord(rows[0]) : null;
  }
  private async version(workspaceId: string, id: string): Promise<CreativeVersionRecord | null> {
    if (!isUuid(id)) return null;
    const rows = await this.sql<
      VersionRow[]
    >`SELECT cv.id, cv.workspace_id, cv.creative_id, cv.version_no, cv.parent_version_id, fp.stable_key, cv.layout_template_id, cv.brief_version_id, cv.document_json, cv.copy_assets_json, cv.generation_metadata_json, cv.status, cv.revision_no, cv.created_by, cv.created_at, cv.frozen_at FROM creative_version cv JOIN format_profile fp ON fp.id = cv.format_profile_id WHERE cv.workspace_id = ${workspaceId} AND cv.id = ${id}`;
    return rows[0] ? versionRecord(rows[0]) : null;
  }

  async listCreativeSets(workspaceId: string, campaignId?: string) {
    const rows = campaignId
      ? await this.sql<
          SetRow[]
        >`SELECT id, workspace_id, campaign_id, project_id, name, generation_request_id, status, revision_no, created_at, updated_at, deleted_at FROM creative_set WHERE workspace_id = ${workspaceId} AND campaign_id = ${campaignId} AND deleted_at IS NULL ORDER BY created_at, id`
      : await this.sql<
          SetRow[]
        >`SELECT id, workspace_id, campaign_id, project_id, name, generation_request_id, status, revision_no, created_at, updated_at, deleted_at FROM creative_set WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL ORDER BY created_at, id`;
    return rows.length
      ? rows.map(setRecord)
      : this.delegate.listCreativeSets(workspaceId, campaignId);
  }
  async listCreativeSetsByProject(workspaceId: string, projectId: string) {
    const rows = await this.sql<
      SetRow[]
    >`SELECT id, workspace_id, campaign_id, project_id, name, generation_request_id, status, revision_no, created_at, updated_at, deleted_at FROM creative_set WHERE workspace_id = ${workspaceId} AND project_id = ${projectId} AND deleted_at IS NULL ORDER BY created_at, id`;
    return rows.map(setRecord);
  }
  async getCreativeSet(workspaceId: string, id: string) {
    return (await this.set(workspaceId, id)) ?? this.delegate.getCreativeSet(workspaceId, id);
  }
  async createCreativeSet(input: Parameters<CreativeRepositories["createCreativeSet"]>[0]) {
    const context = this.projectContext();
    if (
      !context ||
      context.workspaceId !== input.workspaceId ||
      context.campaignId !== input.campaignId
    )
      return this.delegate.createCreativeSet(input);
    if (input.generationRequestId !== context.jobId)
      throw Object.assign(new Error("Frozen CreativeSet must bind to its executing job"), {
        code: "PROJECT_CREATIVE_SET_JOB_MISMATCH",
      });
    const request = await this.sql<
      { id: string }[]
    >`SELECT id FROM generation_request WHERE workspace_id = ${context.workspaceId} AND campaign_id = ${context.campaignId} AND project_id = ${context.projectId} AND async_job_id = ${context.jobId}`;
    if (request.length !== 1)
      throw Object.assign(new Error("Durable Project generation request is missing or ambiguous"), {
        code: "PROJECT_GENERATION_REQUEST_REQUIRED",
      });
    const id = input.id ?? randomUUID();
    await this
      .sql`INSERT INTO creative_set (id, workspace_id, campaign_id, project_id, name, generation_request_id, status) VALUES (${id}, ${input.workspaceId}, ${input.campaignId}, ${context.projectId}, ${input.name}, ${request[0]!.id}, ${input.status ?? "DRAFT"}) ON CONFLICT (id) DO NOTHING`;
    await this
      .sql`UPDATE generation_request SET creative_set_id = ${id} WHERE id = ${request[0]!.id} AND workspace_id = ${context.workspaceId} AND creative_set_id IS NULL`;
    const created = await this.set(input.workspaceId, id);
    if (
      !created ||
      created.projectId !== context.projectId ||
      created.generationRequestId !== request[0]!.id
    )
      throw Object.assign(new Error("Durable CreativeSet binding failed"), {
        code: "PROJECT_CREATIVE_SET_PERSIST_FAILED",
      });
    return created;
  }
  updateCreativeSet(...args: Parameters<CreativeRepositories["updateCreativeSet"]>) {
    return this.delegate.updateCreativeSet(...args);
  }
  archiveCreativeSet(...args: Parameters<CreativeRepositories["archiveCreativeSet"]>) {
    return this.delegate.archiveCreativeSet(...args);
  }
  async listCreatives(workspaceId: string, creativeSetId?: string) {
    if (!creativeSetId) return this.delegate.listCreatives(workspaceId);
    const rows = await this.sql<
      CreativeRow[]
    >`SELECT id, workspace_id, creative_set_id, campaign_id, product_id, campaign_format_selection_id, current_version_id, status, revision_no, created_at, updated_at, deleted_at FROM creative WHERE workspace_id = ${workspaceId} AND creative_set_id = ${creativeSetId} AND deleted_at IS NULL ORDER BY created_at, id`;
    return rows.length
      ? rows.map(creativeRecord)
      : this.delegate.listCreatives(workspaceId, creativeSetId);
  }
  async getCreative(workspaceId: string, id: string) {
    return (await this.creative(workspaceId, id)) ?? this.delegate.getCreative(workspaceId, id);
  }
  async createCreative(input: Parameters<CreativeRepositories["createCreative"]>[0]) {
    const set = await this.set(input.workspaceId, input.creativeSetId);
    if (!set?.projectId) return this.delegate.createCreative(input);
    const bindings = (await this
      .sql`SELECT gri.campaign_format_selection_id AS selection_id FROM generation_request_item gri JOIN campaign_format_selection cfs ON cfs.id = gri.campaign_format_selection_id JOIN format_profile fp ON fp.id = cfs.format_profile_id WHERE gri.workspace_id = ${input.workspaceId} AND gri.generation_request_id = ${set.generationRequestId ?? ""} AND gri.product_id = ${input.productId ?? null} AND fp.stable_key = ${input.campaignFormatSelectionId}`) as {
      selection_id: string;
    }[];
    if (bindings.length !== 1)
      throw Object.assign(
        new Error("Canonical format key has no exact durable campaign selection"),
        {
          code: bindings.length
            ? "PROJECT_FORMAT_SELECTION_AMBIGUOUS"
            : "PROJECT_FORMAT_SELECTION_REQUIRED",
        },
      );
    const id = input.id ?? randomUUID();
    await this
      .sql`INSERT INTO creative (id, workspace_id, creative_set_id, campaign_id, product_id, campaign_format_selection_id, status) VALUES (${id}, ${input.workspaceId}, ${input.creativeSetId}, ${input.campaignId}, ${input.productId ?? null}, ${bindings[0]!.selection_id}, ${input.status ?? "DRAFT"}) ON CONFLICT (id) DO NOTHING`;
    const created = await this.creative(input.workspaceId, id);
    if (!created) throw new Error("PROJECT_CREATIVE_PERSIST_FAILED");
    return created;
  }
  async updateCreative(
    workspaceId: string,
    id: string,
    patch: Parameters<CreativeRepositories["updateCreative"]>[2],
    expectedRevision?: number,
  ) {
    const existing = await this.creative(workspaceId, id);
    if (!existing) return this.delegate.updateCreative(workspaceId, id, patch, expectedRevision);
    if (expectedRevision !== undefined && existing.revisionNo !== expectedRevision)
      throw new Error("REVISION_MISMATCH");
    const rows = await this.sql<
      CreativeRow[]
    >`UPDATE creative SET status = ${patch.status ?? existing.status}, current_version_id = ${patch.currentVersionId ?? existing.currentVersionId ?? null}, product_id = ${patch.productId ?? existing.productId ?? null}, revision_no = revision_no + 1, updated_at = now() WHERE workspace_id = ${workspaceId} AND id = ${id} RETURNING id, workspace_id, creative_set_id, campaign_id, product_id, campaign_format_selection_id, current_version_id, status, revision_no, created_at, updated_at, deleted_at`;
    if (!rows[0]) throw new Error("PROJECT_CREATIVE_UPDATE_PERSIST_FAILED");
    return creativeRecord(rows[0]);
  }
  async createVersion(input: Parameters<CreativeRepositories["createVersion"]>[0]) {
    const creative = await this.creative(input.workspaceId, input.creativeId);
    if (!creative) return this.delegate.createVersion(input);
    const formats = await this.sql<
      { format_profile_id: string; stable_key: string; layout_template_id: string | null }[]
    >`SELECT fp.id AS format_profile_id, fp.stable_key, cfs.layout_template_id FROM creative c JOIN campaign_format_selection cfs ON cfs.id = c.campaign_format_selection_id JOIN format_profile fp ON fp.id = cfs.format_profile_id WHERE c.workspace_id = ${input.workspaceId} AND c.id = ${input.creativeId}`;
    if (formats.length !== 1 || formats[0]!.stable_key !== input.formatProfileId)
      throw Object.assign(
        new Error("Creative version canonical key does not match durable selection"),
        { code: "PROJECT_FORMAT_PROFILE_MISMATCH" },
      );
    const id = input.id ?? randomUUID();
    const versionNo = input.versionNo ?? 1;
    await this.sql.begin(async (transaction) => {
      await transaction`INSERT INTO creative_version (id, workspace_id, creative_id, version_no, parent_version_id, format_profile_id, layout_template_id, brief_version_id, document_json, copy_assets_json, generation_metadata_json, status, revision_no, created_by) VALUES (${id}, ${input.workspaceId}, ${input.creativeId}, ${versionNo}, ${input.parentVersionId ?? null}, ${formats[0]!.format_profile_id}, ${formats[0]!.layout_template_id}, ${input.briefVersionId}, convert_from(${jsonb(input.documentJson)}, 'UTF8')::jsonb, convert_from(${jsonb(input.copyAssetsJson ?? {})}, 'UTF8')::jsonb, convert_from(${jsonb(input.generationMetadataJson ?? {})}, 'UTF8')::jsonb, ${input.status ?? "DRAFT"}, ${input.revisionNo ?? 1}, ${input.createdBy ?? null}) ON CONFLICT (id) DO NOTHING`;
      const persisted = await transaction<
        { creative_id: string }[]
      >`SELECT creative_id FROM creative_version WHERE workspace_id = ${input.workspaceId} AND id = ${id}`;
      if (persisted.length !== 1 || persisted[0]!.creative_id !== input.creativeId)
        throw new Error("PROJECT_CREATIVE_VERSION_IDENTITY_MISMATCH");
      const pointed = await transaction<
        { id: string }[]
      >`UPDATE creative SET current_version_id = ${id}, revision_no = CASE WHEN current_version_id IS DISTINCT FROM ${id} THEN revision_no + 1 ELSE revision_no END, updated_at = CASE WHEN current_version_id IS DISTINCT FROM ${id} THEN now() ELSE updated_at END WHERE workspace_id = ${input.workspaceId} AND id = ${input.creativeId} RETURNING id`;
      if (pointed.length !== 1) throw new Error("PROJECT_CREATIVE_CURRENT_VERSION_PERSIST_FAILED");
    });
    const created = await this.version(input.workspaceId, id);
    if (!created) throw new Error("PROJECT_CREATIVE_VERSION_PERSIST_FAILED");
    return created;
  }
  async listVersions(workspaceId: string, creativeId: string) {
    const rows = await this.sql<
      VersionRow[]
    >`SELECT cv.id, cv.workspace_id, cv.creative_id, cv.version_no, cv.parent_version_id, fp.stable_key, cv.layout_template_id, cv.brief_version_id, cv.document_json, cv.copy_assets_json, cv.generation_metadata_json, cv.status, cv.revision_no, cv.created_by, cv.created_at, cv.frozen_at FROM creative_version cv JOIN format_profile fp ON fp.id = cv.format_profile_id WHERE cv.workspace_id = ${workspaceId} AND cv.creative_id = ${creativeId} ORDER BY cv.version_no`;
    return rows.length
      ? rows.map(versionRecord)
      : this.delegate.listVersions(workspaceId, creativeId);
  }
  async getVersion(workspaceId: string, id: string) {
    return (await this.version(workspaceId, id)) ?? this.delegate.getVersion(workspaceId, id);
  }
  updateDraftVersion(...args: Parameters<CreativeRepositories["updateDraftVersion"]>) {
    return this.delegate.updateDraftVersion(...args);
  }
  freezeVersion(...args: Parameters<CreativeRepositories["freezeVersion"]>) {
    return this.delegate.freezeVersion(...args);
  }
  async addAssetUsages(items: Parameters<CreativeRepositories["addAssetUsages"]>[0]) {
    const output: CreativeAssetUsageRecord[] = [];
    for (const item of items) {
      const version = await this.version(item.workspaceId, item.creativeVersionId);
      if (!version) {
        output.push(...(await this.delegate.addAssetUsages([item])));
        continue;
      }
      const id = item.id ?? randomUUID();
      const rows = await this.sql<
        {
          id: string;
          workspace_id: string;
          creative_version_id: string;
          asset_version_id: string;
          element_id: string | null;
          usage_type: string;
          transform_json: Record<string, unknown>;
          created_at: Date;
        }[]
      >`INSERT INTO creative_asset_usage (id, workspace_id, creative_version_id, asset_version_id, element_id, usage_type, transform_json) VALUES (${id}, ${item.workspaceId}, ${item.creativeVersionId}, ${item.assetVersionId}, ${item.elementId ?? null}, ${item.usageType}, convert_from(${jsonb(item.transformJson)}, 'UTF8')::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id, workspace_id, creative_version_id, asset_version_id, element_id, usage_type, transform_json, created_at`;
      const row = rows[0];
      if (!row) throw new Error("PROJECT_CREATIVE_ASSET_USAGE_PERSIST_FAILED");
      output.push({
        id: row.id,
        workspaceId: row.workspace_id,
        creativeVersionId: row.creative_version_id,
        assetVersionId: row.asset_version_id,
        elementId: row.element_id,
        usageType: row.usage_type,
        transformJson: row.transform_json,
        createdAt: iso(row.created_at),
      });
    }
    return output;
  }
  listAssetUsages(...args: Parameters<CreativeRepositories["listAssetUsages"]>) {
    return this.delegate.listAssetUsages(...args);
  }
  async listAssetUsageGraph(workspaceId: string, assetVersionId?: string) {
    if (!assetVersionId) return this.delegate.listAssetUsageGraph(workspaceId);
    const rows = await this.sql<
      AssetUsageGraphRecord[]
    >`SELECT cau.id, cau.workspace_id AS "workspaceId", cau.creative_version_id AS "creativeVersionId", cau.asset_version_id AS "assetVersionId", cau.element_id AS "elementId", cau.usage_type AS "usageType", cau.transform_json AS "transformJson", cau.created_at AS "createdAt", cv.creative_id AS "creativeId", c.creative_set_id AS "creativeSetId", c.campaign_id AS "campaignId", cs.project_id AS "projectId" FROM creative_asset_usage cau JOIN creative_version cv ON cv.id = cau.creative_version_id JOIN creative c ON c.id = cv.creative_id JOIN creative_set cs ON cs.id = c.creative_set_id WHERE cau.workspace_id = ${workspaceId} AND cau.asset_version_id = ${assetVersionId}`;
    return rows.length ? rows : this.delegate.listAssetUsageGraph(workspaceId, assetVersionId);
  }
  appendEditOperations(...args: Parameters<CreativeRepositories["appendEditOperations"]>) {
    return this.delegate.appendEditOperations(...args);
  }
  listEditOperations(...args: Parameters<CreativeRepositories["listEditOperations"]>) {
    return this.delegate.listEditOperations(...args);
  }
  async createRender(input: Parameters<CreativeRepositories["createRender"]>[0]) {
    const version = await this.version(input.workspaceId, input.creativeVersionId);
    if (!version) return this.delegate.createRender(input);
    const id = input.id ?? randomUUID();
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        creative_version_id: string;
        async_job_id: string | null;
        render_purpose: string;
        file_object_id: string;
        status: CreativeRenderRecord["status"];
        render_config_json: Record<string, unknown>;
        created_at: Date;
      }[]
    >`INSERT INTO creative_render (id, workspace_id, creative_version_id, async_job_id, render_purpose, file_object_id, status, render_config_json) VALUES (${id}, ${input.workspaceId}, ${input.creativeVersionId}, ${input.asyncJobId ?? null}, ${input.renderPurpose}, ${input.fileObjectId}, ${input.status ?? "COMPLETED"}, convert_from(${jsonb(input.renderConfigJson)}, 'UTF8')::jsonb) RETURNING id, workspace_id, creative_version_id, async_job_id, render_purpose, file_object_id, status, render_config_json, created_at`;
    const row = rows[0];
    if (!row) throw new Error("PROJECT_CREATIVE_RENDER_PERSIST_FAILED");
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      creativeVersionId: row.creative_version_id,
      asyncJobId: row.async_job_id,
      renderPurpose: row.render_purpose,
      fileObjectId: row.file_object_id,
      status: row.status,
      renderConfigJson: row.render_config_json,
      createdAt: iso(row.created_at),
    };
  }
  listRenders(...args: Parameters<CreativeRepositories["listRenders"]>) {
    return this.delegate.listRenders(...args);
  }
}
