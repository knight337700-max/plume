import type { Sql } from "postgres";
import type {
  AssetUsageGraphRecord,
  CreativeSetRecord,
} from "../../../core/src/modules/creative/repositories.js";

/** Durable Project CreativeSet query; avoids the legacy broad in-memory creative seam. */
export class DrizzleProjectCreativeQueryRepository {
  constructor(private readonly sql: Sql) {}

  async listCreativeSetsByProject(
    workspaceId: string,
    projectId: string,
  ): Promise<readonly CreativeSetRecord[]> {
    const rows = await this.sql<
      {
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
      }[]
    >`SELECT id, workspace_id, campaign_id, project_id, name, generation_request_id, status,
      revision_no, created_at, updated_at, deleted_at
      FROM creative_set
      WHERE workspace_id = ${workspaceId} AND project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY created_at, id`;
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      projectId: row.project_id,
      name: row.name,
      generationRequestId: row.generation_request_id,
      status: row.status,
      revisionNo: row.revision_no,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at?.toISOString() ?? null,
    }));
  }

  async listAssetUsageGraph(
    workspaceId: string,
    assetVersionId?: string,
  ): Promise<readonly AssetUsageGraphRecord[]> {
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
        creative_id: string;
        creative_set_id: string;
        campaign_id: string;
        project_id: string | null;
      }[]
    >`SELECT cau.id, cau.workspace_id, cau.creative_version_id, cau.asset_version_id,
      cau.element_id, cau.usage_type, cau.transform_json, cau.created_at, c.id AS creative_id,
      c.creative_set_id, c.campaign_id, cs.project_id
      FROM creative_asset_usage cau
      JOIN creative_version cv ON cv.id = cau.creative_version_id
      JOIN creative c ON c.id = cv.creative_id
      JOIN creative_set cs ON cs.id = c.creative_set_id
      WHERE cau.workspace_id = ${workspaceId}
        AND (${assetVersionId ?? null}::uuid IS NULL OR cau.asset_version_id = ${assetVersionId ?? null})`;
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      creativeVersionId: row.creative_version_id,
      assetVersionId: row.asset_version_id,
      elementId: row.element_id,
      usageType: row.usage_type,
      transformJson: row.transform_json,
      createdAt: row.created_at.toISOString(),
      creativeId: row.creative_id,
      creativeSetId: row.creative_set_id,
      campaignId: row.campaign_id,
      projectId: row.project_id,
    }));
  }
}
