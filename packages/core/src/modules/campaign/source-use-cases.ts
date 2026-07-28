import type { CampaignRepositories, CampaignSourceRecord } from "./repositories.js";

export interface CampaignFileObjectReader { getFile(workspaceId: string, fileObjectId: string): Promise<{ readonly id: string; readonly workspaceId: string; readonly status?: "COMPLETED" | "PENDING" }> }
export interface AttachSourceInput { readonly workspaceId: string; readonly campaignId: string; readonly fileObjectId: string; readonly sourceType: string; readonly notes?: string; readonly uploadedBy?: string }
export interface CampaignSourceUseCases { list(workspaceId: string, campaignId: string, includeRemoved?: boolean): Promise<readonly CampaignSourceRecord[]>; attach(input: AttachSourceInput): Promise<CampaignSourceRecord>; remove(workspaceId: string, campaignId: string, sourceId: string): Promise<CampaignSourceRecord>; activeForAnalysis(workspaceId: string, campaignId: string): Promise<readonly CampaignSourceRecord[]> }

export function createCampaignSourceUseCases(dependencies: { readonly repositories: CampaignRepositories; readonly files: CampaignFileObjectReader }): CampaignSourceUseCases {
  return {
    list: (workspaceId, campaignId, includeRemoved) => dependencies.repositories.listSources(workspaceId, campaignId, includeRemoved),
    async attach(input) {
      const file = await dependencies.files.getFile(input.workspaceId, input.fileObjectId);
      if (!file || file.workspaceId !== input.workspaceId || (file.status && file.status !== "COMPLETED")) { const error = new Error("Only completed file objects can be attached"); Object.assign(error, { code: "FILE_NOT_COMPLETED", statusCode: 409 }); throw error; }
      return dependencies.repositories.attachSource(input);
    },
    remove: (workspaceId, campaignId, sourceId) => dependencies.repositories.removeSource(workspaceId, campaignId, sourceId),
    activeForAnalysis: (workspaceId, campaignId) => dependencies.repositories.listSources(workspaceId, campaignId, false),
  };
}
