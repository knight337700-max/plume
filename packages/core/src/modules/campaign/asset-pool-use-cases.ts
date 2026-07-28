import type { CampaignAssetPoolSelectionRecord, CampaignAssetRecommendationRecord, CampaignRepositories } from "./repositories.js";

export interface AssetRecommendationInput { readonly assetVersionId: string; readonly score: number; readonly rationale?: string; readonly licenseStatus: string }
export interface AssetPoolSelectionInput { readonly workspaceId: string; readonly campaignId: string; readonly productId: string; readonly assetVersionId: string; readonly status: "SELECTED" | "EXCLUDED"; readonly licenseStatus: string; readonly reason?: string }
export interface CampaignAssetPoolUseCases { recommend(workspaceId: string, campaignId: string, productId: string, items: readonly AssetRecommendationInput[]): Promise<readonly CampaignAssetRecommendationRecord[]>; get(workspaceId: string, campaignId: string, productId?: string): Promise<{ readonly recommendations: readonly CampaignAssetRecommendationRecord[]; readonly selections: readonly CampaignAssetPoolSelectionRecord[] }>; select(input: AssetPoolSelectionInput): Promise<CampaignAssetPoolSelectionRecord> }

export function createCampaignAssetPoolUseCases(repositories: CampaignRepositories): CampaignAssetPoolUseCases {
  return {
    recommend: (workspaceId, campaignId, productId, items) => repositories.addAssetRecommendations(items.map((item) => ({ workspaceId, campaignId, productId, assetVersionId: item.assetVersionId, score: item.score, licenseStatus: item.licenseStatus, ...(item.rationale ? { rationale: item.rationale } : {}) }))),
    async get(workspaceId, campaignId, productId) { return { recommendations: await repositories.listAssetRecommendations(workspaceId, campaignId, productId), selections: await repositories.listAssetPoolSelections(workspaceId, campaignId, productId) }; },
    async select(input) {
      if (input.status === "SELECTED" && !["VALID", "UNKNOWN"].includes(input.licenseStatus)) { const error = new Error("License-invalid assets cannot be preferred"); Object.assign(error, { code: "ASSET_LICENSE_INVALID", statusCode: 409 }); throw error; }
      return repositories.upsertAssetPoolSelection({ workspaceId: input.workspaceId, campaignId: input.campaignId, productId: input.productId, assetVersionId: input.assetVersionId, status: input.status, ...(input.reason ? { reason: input.reason } : {}) });
    },
  };
}
