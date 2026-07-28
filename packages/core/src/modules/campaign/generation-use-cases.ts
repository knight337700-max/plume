import type { CampaignRepositories, GenerationItemRecord, GenerationRequestRecord } from "./repositories.js";

export interface GenerationProductInput { readonly productId: string; readonly variantKeys?: readonly string[] }
export interface GenerationRequestInput { readonly workspaceId: string; readonly campaignId: string; readonly briefVersionId: string; readonly products: readonly GenerationProductInput[]; readonly formatProfileIds: readonly string[] }
export interface GenerationAggregate { readonly request: GenerationRequestRecord; readonly items: readonly GenerationItemRecord[] }
export interface GenerationUseCases { create(input: GenerationRequestInput): Promise<GenerationAggregate>; get(workspaceId: string, requestId: string): Promise<GenerationAggregate | null> }

export function createGenerationUseCases(repositories: CampaignRepositories): GenerationUseCases {
  return {
    async create(input) {
      const campaign = await repositories.getCampaign(input.workspaceId, input.campaignId);
      if (!campaign) { const error = new Error("Campaign not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; }
      const brief = await repositories.getBrief(input.workspaceId, input.campaignId);
      if (!brief?.currentVersionId || brief.currentVersionId !== input.briefVersionId) { const error = new Error("Generation must use the current brief version"); Object.assign(error, { code: "BRIEF_VERSION_STALE", statusCode: 409 }); throw error; }
      const version = await repositories.getBriefVersion(input.workspaceId, input.briefVersionId);
      if (!version || version.status !== "CONFIRMED") { const error = new Error("Generation requires a confirmed brief version"); Object.assign(error, { code: "BRIEF_NOT_CONFIRMED", statusCode: 409 }); throw error; }
      const items = input.products.flatMap((product) => (product.variantKeys?.length ? product.variantKeys : ["default"]).flatMap((variantKey) => input.formatProfileIds.map((formatProfileId) => ({ workspaceId: input.workspaceId, generationRequestId: "pending", productId: product.productId, formatProfileId, variantKey, checkpointJson: { stage: "QUEUED" } }))));
      const aggregate = await repositories.createGenerationAggregate({ workspaceId: input.workspaceId, campaignId: input.campaignId, briefVersionId: input.briefVersionId, estimatedItemCount: items.length }, items);
      return aggregate;
    },
    get: (workspaceId, requestId) => repositories.getGenerationRequest(workspaceId, requestId),
  };
}
