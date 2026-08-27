import type { Sql } from "postgres";
import type { ProjectGenerationCampaignContext } from "../../../core/src/modules/project/project-generation-preparer.js";

/** SQL authority for the brief validation performed before a Project job is enqueued. */
export class DrizzleProjectGenerationContext implements ProjectGenerationCampaignContext {
  constructor(private readonly sql: Sql) {}
  async getConfirmedBriefVersion(workspaceId: string, campaignId: string, requestedId?: string) {
    const rows = await this.sql<{ current_version_id: string | null; id: string }[]>`
      SELECT cb.current_version_id, cbv.id
      FROM campaign_brief cb
      JOIN campaign_brief_version cbv ON cbv.id = cb.current_version_id
      WHERE cb.workspace_id = ${workspaceId} AND cb.campaign_id = ${campaignId}
        AND cbv.workspace_id = ${workspaceId} AND cbv.status = 'CONFIRMED'`;
    const row = rows[0];
    if (!row || !row.current_version_id || (requestedId && requestedId !== row.current_version_id))
      throw Object.assign(new Error("Generation requires the current confirmed brief version"), {
        code: requestedId ? "BRIEF_VERSION_STALE" : "BRIEF_NOT_CONFIRMED",
        statusCode: 409,
      });
    return row.current_version_id;
  }
}
