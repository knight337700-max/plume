import type {
  CampaignRepositories,
  GenerationAssetSnapshotItem,
  GenerationItemRecord,
  GenerationRequestRecord,
} from "./repositories.js";
import type { ProjectUseCases } from "../project/project-use-cases.js";
import type { CreativeRepositories } from "../creative/repositories.js";

export interface GenerationProductInput {
  readonly productId: string;
  readonly variantKeys?: readonly string[];
}
export interface GenerationRequestInput {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly projectId?: string | null;
  readonly briefVersionId?: string;
  readonly products: readonly GenerationProductInput[];
  readonly formatProfileIds: readonly string[];
}
export interface GenerationAggregate {
  readonly request: GenerationRequestRecord;
  readonly items: readonly GenerationItemRecord[];
}
export interface GenerationUseCases {
  create(input: GenerationRequestInput): Promise<GenerationAggregate>;
  get(workspaceId: string, requestId: string): Promise<GenerationAggregate | null>;
}

export function createGenerationUseCases(
  repositories: CampaignRepositories,
  projectContract?: {
    readonly projects: ProjectUseCases;
    readonly creatives: CreativeRepositories;
  },
): GenerationUseCases {
  return {
    async create(input) {
      const campaign = await repositories.getCampaign(input.workspaceId, input.campaignId);
      if (!campaign) {
        const error = new Error("Campaign not found");
        Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
        throw error;
      }
      const brief = await repositories.getBrief(input.workspaceId, input.campaignId);
      const briefVersionId = input.briefVersionId ?? brief?.currentVersionId;
      if (
        !briefVersionId ||
        !brief?.currentVersionId ||
        brief.currentVersionId !== briefVersionId
      ) {
        const error = new Error("Generation must use the current brief version");
        Object.assign(error, { code: "BRIEF_VERSION_STALE", statusCode: 409 });
        throw error;
      }
      const version = await repositories.getBriefVersion(input.workspaceId, briefVersionId);
      if (!version || version.status !== "CONFIRMED") {
        const error = new Error("Generation requires a confirmed brief version");
        Object.assign(error, { code: "BRIEF_NOT_CONFIRMED", statusCode: 409 });
        throw error;
      }
      let snapshot: readonly GenerationAssetSnapshotItem[] = [];
      if (input.projectId) {
        if (!projectContract)
          throw Object.assign(new Error("Project generation contract is unavailable"), {
            code: "PROJECT_CONTRACT_UNAVAILABLE",
            statusCode: 503,
          });
        const project = await projectContract.projects.get(input.workspaceId, input.projectId);
        if (project.campaignId !== input.campaignId)
          throw Object.assign(new Error("Project belongs to another campaign"), {
            code: "PROJECT_CAMPAIGN_MISMATCH",
            statusCode: 409,
          });
        const effective = await projectContract.projects.effectiveAssets(
          input.workspaceId,
          input.projectId,
        );
        const blocked = effective.filter((item) => !item.eligible);
        if (blocked.length)
          throw Object.assign(new Error("Project contains ineligible generation assets"), {
            code: "PROJECT_ASSET_INELIGIBLE",
            statusCode: 409,
          });
        snapshot = effective.map(({ assetVersionId, productId, roleCode, source }) =>
          Object.freeze({ assetVersionId, productId, roleCode: roleCode!, source }),
        );
      }
      const items = input.products.flatMap((product) =>
        (product.variantKeys?.length ? product.variantKeys : ["default"]).flatMap((variantKey) =>
          input.formatProfileIds.map((formatProfileId) => ({
            workspaceId: input.workspaceId,
            generationRequestId: "pending",
            productId: product.productId,
            formatProfileId,
            variantKey,
            checkpointJson: { stage: "QUEUED" },
          })),
        ),
      );
      const aggregate = await repositories.createGenerationAggregate(
        {
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          ...(input.projectId
            ? { projectId: input.projectId, assetPoolSnapshotJson: snapshot }
            : {}),
          briefVersionId,
          estimatedItemCount: items.length,
        },
        items,
      );
      if (input.projectId && projectContract)
        await projectContract.creatives.createCreativeSet({
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          projectId: input.projectId,
          name: `Generation ${aggregate.request.id}`,
          generationRequestId: aggregate.request.id,
        });
      return aggregate;
    },
    get: (workspaceId, requestId) => repositories.getGenerationRequest(workspaceId, requestId),
  };
}
