import type { Sql } from "postgres";
import type {
  AssetRecord,
  AssetVersionRecord,
} from "../../../core/src/modules/asset/repositories.js";
import type {
  CampaignAssetPoolSelectionRecord,
  CampaignBriefRecord,
  CampaignBriefVersionRecord,
  CampaignFormatSelectionRecord,
  CampaignProductRecord,
  CampaignRecord,
} from "../../../core/src/modules/campaign/repositories.js";
import type {
  ProjectAssetContext,
  ProjectCampaignContext,
} from "../../../core/src/modules/project/project-use-cases.js";

const iso = (value: Date) => value.toISOString();

/** Narrow SQL read ports used only by the durable Project contract. */
export class DrizzleProjectContextReaders implements ProjectCampaignContext, ProjectAssetContext {
  constructor(private readonly sql: Sql) {}

  async getCampaign(workspaceId: string, id: string): Promise<CampaignRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        brand_id: string;
        display_code: string;
        name: string;
        objective_code: string;
        status: CampaignRecord["status"];
        current_step: string;
        start_date: string | null;
        end_date: string | null;
        landing_url: string | null;
        owner_user_id: string | null;
        revision_no: number;
        created_at: Date;
        updated_at: Date;
      }[]
    >`SELECT id, workspace_id, brand_id, display_code, name, objective_code, status, current_step,
      start_date, end_date, landing_url, owner_user_id, revision_no, created_at, updated_at
      FROM campaign WHERE id = ${id} AND workspace_id = ${workspaceId} AND deleted_at IS NULL`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          brandId: row.brand_id,
          displayCode: row.display_code,
          name: row.name,
          objectiveCode: row.objective_code,
          status: row.status,
          currentStep: row.current_step,
          ...(row.start_date ? { startDate: row.start_date } : {}),
          ...(row.end_date ? { endDate: row.end_date } : {}),
          ...(row.landing_url ? { landingUrl: row.landing_url } : {}),
          ...(row.owner_user_id ? { ownerUserId: row.owner_user_id } : {}),
          revisionNo: row.revision_no,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }
      : null;
  }

  async listCampaignProducts(
    workspaceId: string,
    campaignId: string,
  ): Promise<readonly CampaignProductRecord[]> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        campaign_id: string;
        product_id: string;
        brief_version_id: string;
        status: CampaignProductRecord["status"];
        created_at: Date;
        confirmed_at: Date | null;
      }[]
    >`SELECT id, workspace_id, campaign_id, product_id, brief_version_id, status, created_at, confirmed_at FROM campaign_product WHERE workspace_id = ${workspaceId} AND campaign_id = ${campaignId} ORDER BY created_at, id`;
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      productId: row.product_id,
      briefVersionId: row.brief_version_id,
      status: row.status,
      ...(row.confirmed_at ? { confirmedAt: iso(row.confirmed_at) } : {}),
      createdAt: iso(row.created_at),
    }));
  }

  async getBrief(workspaceId: string, campaignId: string): Promise<CampaignBriefRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        campaign_id: string;
        current_version_id: string | null;
        revision_no: number;
      }[]
    >`SELECT id, workspace_id, campaign_id, current_version_id, revision_no FROM campaign_brief
      WHERE workspace_id = ${workspaceId} AND campaign_id = ${campaignId}`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          campaignId: row.campaign_id,
          ...(row.current_version_id ? { currentVersionId: row.current_version_id } : {}),
          revisionNo: row.revision_no,
        }
      : null;
  }

  async getBriefVersion(
    workspaceId: string,
    id: string,
  ): Promise<CampaignBriefVersionRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        campaign_brief_id: string;
        version_no: number;
        parent_version_id: string | null;
        source_kind: string;
        content_json: Record<string, unknown>;
        source_citations_json: unknown[];
        brand_profile_snapshot_json: Record<string, unknown>;
        status: CampaignBriefVersionRecord["status"];
        created_by: string | null;
        confirmed_at: Date | null;
        created_at: Date;
      }[]
    >`SELECT id, workspace_id, campaign_brief_id, version_no, parent_version_id, source_kind,
      content_json, source_citations_json, brand_profile_snapshot_json, status, created_by, confirmed_at, created_at
      FROM campaign_brief_version WHERE workspace_id = ${workspaceId} AND id = ${id}`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          campaignBriefId: row.campaign_brief_id,
          versionNo: row.version_no,
          ...(row.parent_version_id ? { parentVersionId: row.parent_version_id } : {}),
          sourceKind: row.source_kind,
          contentJson: row.content_json,
          sourceCitationsJson: row.source_citations_json,
          brandProfileSnapshotJson: row.brand_profile_snapshot_json,
          status: row.status,
          ...(row.created_by ? { createdBy: row.created_by } : {}),
          ...(row.confirmed_at ? { confirmedAt: iso(row.confirmed_at) } : {}),
          createdAt: iso(row.created_at),
        }
      : null;
  }

  async listFormatSelections(
    workspaceId: string,
    campaignId: string,
  ): Promise<readonly CampaignFormatSelectionRecord[]> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        campaign_id: string;
        channel_code: string;
        stable_key: string;
        version: string;
        status: CampaignFormatSelectionRecord["status"];
        format_snapshot_json: Record<string, unknown>;
        updated_at: Date;
      }[]
    >`SELECT cfs.id, cfs.workspace_id, cfs.campaign_id, ch.code AS channel_code, fp.stable_key,
      fp.version, cfs.status, cfs.format_snapshot_json, cfs.updated_at
      FROM campaign_format_selection cfs
      JOIN campaign_channel_selection ccs ON ccs.id = cfs.campaign_channel_selection_id
      JOIN channel ch ON ch.id = ccs.channel_id
      JOIN format_profile fp ON fp.id = cfs.format_profile_id
      WHERE cfs.workspace_id = ${workspaceId} AND cfs.campaign_id = ${campaignId}
      ORDER BY cfs.created_at, cfs.id`;
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      channelCode: row.channel_code,
      formatProfileId: row.stable_key,
      profileVersion: row.version,
      status: row.status,
      snapshotJson: row.format_snapshot_json,
      updatedAt: iso(row.updated_at),
    }));
  }

  async listAssetPoolSelections(
    workspaceId: string,
    campaignId: string,
  ): Promise<readonly CampaignAssetPoolSelectionRecord[]> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        campaign_id: string;
        product_id: string | null;
        asset_version_id: string;
        role_code: CampaignAssetPoolSelectionRecord["roleCode"];
        status: CampaignAssetPoolSelectionRecord["status"];
        updated_at: Date;
      }[]
    >`SELECT ca.id, ca.workspace_id, ca.campaign_id, ca.product_id, av.id AS asset_version_id, ca.role_code, ca.status, ca.updated_at FROM campaign_asset ca JOIN design_asset da ON da.id = ca.design_asset_id AND da.workspace_id = ca.workspace_id JOIN asset_version av ON av.id = da.current_version_id AND av.workspace_id = ca.workspace_id WHERE ca.workspace_id = ${workspaceId} AND ca.campaign_id = ${campaignId}`;
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      campaignId: row.campaign_id,
      productId: row.product_id ?? "",
      assetVersionId: row.asset_version_id,
      roleCode: row.role_code ?? null,
      status: row.status,
      updatedAt: iso(row.updated_at),
    }));
  }

  async getVersion(workspaceId: string, id: string): Promise<AssetVersionRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        design_asset_id: string;
        version_no: number;
        file_object_id: string;
        source_type: string;
        analysis_json: Record<string, unknown>;
        created_by: string | null;
        created_at: Date;
      }[]
    >`SELECT id, workspace_id, design_asset_id, version_no, file_object_id, source_type, analysis_json, created_by, created_at FROM asset_version WHERE id = ${id} AND workspace_id = ${workspaceId}`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          designAssetId: row.design_asset_id,
          versionNo: row.version_no,
          fileObjectId: row.file_object_id,
          sourceType: row.source_type,
          analysisJson: row.analysis_json,
          ...(row.created_by ? { createdBy: row.created_by } : {}),
          createdAt: iso(row.created_at),
        }
      : null;
  }

  async getAsset(workspaceId: string, id: string): Promise<AssetRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        workspace_id: string;
        brand_id: string;
        name: string;
        asset_type: string;
        status: AssetRecord["status"];
        current_version_id: string | null;
        license_status: AssetRecord["licenseStatus"];
        license_start_at: Date | null;
        license_end_at: Date | null;
        analysis_summary_json: Record<string, unknown>;
        revision_no: number;
        created_at: Date;
        updated_at: Date;
      }[]
    >`SELECT id, workspace_id, brand_id, name, asset_type, status, current_version_id, license_status, license_start_at, license_end_at, analysis_summary_json, revision_no, created_at, updated_at FROM design_asset WHERE id = ${id} AND workspace_id = ${workspaceId} AND deleted_at IS NULL`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          brandId: row.brand_id,
          name: row.name,
          assetType: row.asset_type,
          status: row.status,
          ...(row.current_version_id ? { currentVersionId: row.current_version_id } : {}),
          licenseStatus: row.license_status,
          ...(row.license_start_at ? { licenseStartAt: iso(row.license_start_at) } : {}),
          ...(row.license_end_at ? { licenseEndAt: iso(row.license_end_at) } : {}),
          analysisSummaryJson: row.analysis_summary_json,
          revisionNo: row.revision_no,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }
      : null;
  }
}
