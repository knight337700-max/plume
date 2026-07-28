import type { CampaignRecord, CampaignRepositories, CampaignActivityRecord } from "./repositories.js";
import { deriveWorkflowState, type WorkflowState } from "./workflow-state.js";

export interface CreateCampaignInput { readonly workspaceId: string; readonly brandId: string; readonly displayCode: string; readonly name: string; readonly objectiveCode: string; readonly startDate?: string; readonly endDate?: string; readonly landingUrl?: string; readonly ownerUserId?: string }
export interface CampaignUseCases {
  list(workspaceId: string, brandId?: string): Promise<readonly CampaignRecord[]>;
  create(input: CreateCampaignInput): Promise<CampaignRecord>;
  get(workspaceId: string, campaignId: string): Promise<CampaignRecord | null>;
  update(workspaceId: string, campaignId: string, patch: Partial<Pick<CampaignRecord, "brandId" | "name" | "objectiveCode" | "startDate" | "endDate" | "landingUrl" | "ownerUserId" | "currentStep">>, expectedRevision?: number): Promise<CampaignRecord>;
  archive(workspaceId: string, campaignId: string, expectedRevision?: number): Promise<CampaignRecord>;
  workflow(workspaceId: string, campaignId: string): Promise<WorkflowState>;
  activity(workspaceId: string, campaignId: string): Promise<readonly CampaignActivityRecord[]>;
}

export function createCampaignUseCases(repositories: CampaignRepositories): CampaignUseCases {
  return {
    list: (workspaceId, brandId) => repositories.listCampaigns(workspaceId, brandId),
    create: (input) => repositories.createCampaign({ ...input, currentStep: "SOURCES" }),
    get: (workspaceId, campaignId) => repositories.getCampaign(workspaceId, campaignId),
    update: (workspaceId, campaignId, patch, expectedRevision) => repositories.updateCampaign(workspaceId, campaignId, patch, expectedRevision),
    archive: (workspaceId, campaignId, expectedRevision) => repositories.archiveCampaign(workspaceId, campaignId, expectedRevision),
    async workflow(workspaceId, campaignId) {
      const campaign = await repositories.getCampaign(workspaceId, campaignId);
      if (!campaign) { const error = new Error("Campaign not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; }
      const brief = await repositories.getBrief(workspaceId, campaignId);
      const briefVersion = brief?.currentVersionId ? await repositories.getBriefVersion(workspaceId, brief.currentVersionId) : undefined;
      const products = await repositories.listCampaignProducts(workspaceId, campaignId);
      const selections = await repositories.listAssetPoolSelections(workspaceId, campaignId);
      const channels = await repositories.listChannelSelections(workspaceId, campaignId);
      const formats = await repositories.listFormatSelections(workspaceId, campaignId);
      return deriveWorkflowState({ campaign, sources: await repositories.listSources(workspaceId, campaignId), briefVersion: briefVersion ?? undefined, products, assetSelections: selections, channels, formats });
    },
    activity: (workspaceId, campaignId) => repositories.listActivity(workspaceId, campaignId),
  };
}
