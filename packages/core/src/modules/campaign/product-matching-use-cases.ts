import type { CampaignProductRecord, CampaignRepositories, ProductMatchingCandidateRecord } from "./repositories.js";

export interface MatchingCandidateInput { readonly productId: string; readonly score: number; readonly rationale?: string }
export interface ConfirmCampaignProductInput { readonly productId: string; readonly status: "CONFIRMED" | "REJECTED" }
export interface ProductMatchingUseCases { run(workspaceId: string, campaignId: string, briefVersionId: string, candidates: readonly MatchingCandidateInput[]): Promise<readonly ProductMatchingCandidateRecord[]>; get(workspaceId: string, campaignId: string): Promise<{ readonly candidates: readonly ProductMatchingCandidateRecord[]; readonly products: readonly CampaignProductRecord[] }>; confirm(workspaceId: string, campaignId: string, briefVersionId: string, items: readonly ConfirmCampaignProductInput[]): Promise<readonly CampaignProductRecord[]> }

export function createProductMatchingUseCases(repositories: CampaignRepositories): ProductMatchingUseCases {
  return {
    run: (workspaceId, campaignId, briefVersionId, candidates) => repositories.addMatchingCandidates(candidates.map((candidate) => ({ workspaceId, campaignId, briefVersionId, productId: candidate.productId, score: candidate.score, ...(candidate.rationale ? { rationale: candidate.rationale } : {}) }))),
    async get(workspaceId, campaignId) { return { candidates: await repositories.listMatchingCandidates(workspaceId, campaignId), products: await repositories.listCampaignProducts(workspaceId, campaignId) }; },
    async confirm(workspaceId, campaignId, briefVersionId, items) {
      const brief = await repositories.getBrief(workspaceId, campaignId);
      if (!brief?.currentVersionId || brief.currentVersionId !== briefVersionId) { const error = new Error("Products must reference the current brief version"); Object.assign(error, { code: "BRIEF_VERSION_STALE", statusCode: 409 }); throw error; }
      const version = await repositories.getBriefVersion(workspaceId, briefVersionId);
      if (!version || version.status !== "CONFIRMED") { const error = new Error("Products require a confirmed brief version"); Object.assign(error, { code: "BRIEF_NOT_CONFIRMED", statusCode: 409 }); throw error; }
      return Promise.all(items.map((item) => repositories.upsertCampaignProduct({ workspaceId, campaignId, productId: item.productId, briefVersionId, status: item.status })));
    },
  };
}
