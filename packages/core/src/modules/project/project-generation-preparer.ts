import type { GenerationAssetSnapshotItem } from "../campaign/repositories.js";
import type { ProjectUseCases } from "./project-use-cases.js";

export interface ProjectGenerationCampaignContext {
  getConfirmedBriefVersion(
    workspaceId: string,
    campaignId: string,
    requestedId?: string,
  ): Promise<string>;
}

export interface PreparedProjectGeneration {
  readonly projectId: string;
  readonly briefVersionId: string;
  readonly assetPoolSnapshot: readonly GenerationAssetSnapshotItem[];
}

export function createProjectGenerationPreparer(deps: {
  projects: ProjectUseCases;
  campaigns: ProjectGenerationCampaignContext;
}) {
  return {
    async prepare(input: {
      workspaceId: string;
      campaignId: string;
      projectId: string;
      briefVersionId?: string;
    }): Promise<PreparedProjectGeneration> {
      const project = await deps.projects.get(input.workspaceId, input.projectId);
      if (project.campaignId !== input.campaignId)
        throw Object.assign(new Error("Project belongs to another campaign"), {
          code: "PROJECT_CAMPAIGN_MISMATCH",
          statusCode: 409,
        });
      const briefVersionId = await deps.campaigns.getConfirmedBriefVersion(
        input.workspaceId,
        input.campaignId,
        input.briefVersionId,
      );
      const effective = await deps.projects.effectiveAssets(input.workspaceId, input.projectId);
      const blocked = effective.filter((item) => !item.eligible || !item.roleCode);
      if (blocked.length)
        throw Object.assign(new Error("Project contains ineligible generation assets"), {
          code: "PROJECT_ASSET_INELIGIBLE",
          statusCode: 409,
        });
      return Object.freeze({
        projectId: input.projectId,
        briefVersionId,
        assetPoolSnapshot: Object.freeze(
          effective.map(({ assetVersionId, productId, roleCode, source }) =>
            Object.freeze({ assetVersionId, productId, roleCode: roleCode!, source }),
          ),
        ),
      });
    },
  };
}
