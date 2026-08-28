import type { FastifyPluginAsync } from "fastify";
import {
  createCampaignUseCases,
  type CampaignUseCases,
} from "../../../../../packages/core/src/modules/campaign/campaign-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { campaignRoutes } from "./campaigns.js";
import { campaignSourceRoutes } from "./sources.js";
import { campaignBriefRoutes } from "./brief.js";
import {
  createCampaignSourceUseCases,
  type CampaignSourceUseCases,
} from "../../../../../packages/core/src/modules/campaign/source-use-cases.js";
import {
  createBriefUseCases,
  type BriefUseCases,
} from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";
import {
  createProductMatchingUseCases,
  type ProductMatchingUseCases,
} from "../../../../../packages/core/src/modules/campaign/product-matching-use-cases.js";
import {
  createCampaignAssetPoolUseCases,
  type CampaignAssetPoolUseCases,
} from "../../../../../packages/core/src/modules/campaign/asset-pool-use-cases.js";
import { productMatchingRoutes } from "./product-matching.js";
import { assetPoolRoutes } from "./asset-pool.js";
import {
  createMediaSelectionUseCases,
  type MediaSelectionUseCases,
} from "../../../../../packages/core/src/modules/campaign/media-selection-use-cases.js";
import { createCanonicalCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";
import { mediaSelectionRoutes } from "./media-selection.js";
import {
  createGenerationUseCases,
  type GenerationUseCases,
} from "../../../../../packages/core/src/modules/campaign/generation-use-cases.js";
import { generationRoutes } from "./generation.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";
import type { CampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import type { ProjectRepositories } from "../../../../../packages/core/src/modules/project/repositories.js";
import type { AssetRepositories } from "../../../../../packages/core/src/modules/asset/repositories.js";
import type { CreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import { createProjectUseCases } from "../../../../../packages/core/src/modules/project/project-use-cases.js";
import type { PreparedProjectGeneration } from "../../../../../packages/core/src/modules/project/project-generation-preparer.js";
import type { DurableFormatBinding } from "../../../../../packages/infrastructure/src/db/project-format-binding-resolver.js";

interface Options {
  readonly campaigns?: CampaignUseCases;
  readonly sources?: CampaignSourceUseCases;
  readonly briefs?: BriefUseCases;
  readonly matching?: ProductMatchingUseCases;
  readonly pool?: CampaignAssetPoolUseCases;
  readonly selection?: MediaSelectionUseCases;
  readonly generation?: GenerationUseCases;
  readonly repositories?: CampaignRepositories;
  readonly projectRepositories?: ProjectRepositories;
  readonly assetRepositories?: AssetRepositories;
  readonly creativeRepositories?: CreativeRepositories;
  readonly asyncCommands?: AsyncCommandPublisher;
  readonly projectGenerationPreparer?: {
    prepare(input: {
      workspaceId: string;
      campaignId: string;
      projectId: string;
      briefVersionId?: string;
    }): Promise<PreparedProjectGeneration>;
  };
  readonly projectFormatBindings?: {
    resolve(
      workspaceId: string,
      campaignId: string,
      formatSelectionIds: readonly string[],
    ): Promise<readonly DurableFormatBinding[]>;
  };
}
export const campaignRouteGroup: FastifyPluginAsync<Options> = async (app, options) => {
  const repositories = options.repositories ?? createInMemoryCampaignRepositories();
  const campaigns = options.campaigns ?? createCampaignUseCases(repositories);
  const sources =
    options.sources ??
    createCampaignSourceUseCases({
      repositories,
      files: {
        async getFile(_workspaceId, id) {
          return { id, workspaceId: _workspaceId, status: "COMPLETED" as const };
        },
      },
    });
  const briefs = options.briefs ?? createBriefUseCases(repositories);
  const matching = options.matching ?? createProductMatchingUseCases(repositories);
  const pool = options.pool ?? createCampaignAssetPoolUseCases(repositories);
  const campaignCatalog = createCanonicalCatalogRepository();
  const selection = options.selection ?? createMediaSelectionUseCases(campaignCatalog);
  const projectContract =
    options.projectRepositories && options.assetRepositories && options.creativeRepositories
      ? {
          projects: createProjectUseCases({
            projects: options.projectRepositories,
            campaigns: repositories,
            assets: options.assetRepositories,
          }),
          creatives: options.creativeRepositories,
        }
      : undefined;
  const generation = options.generation ?? createGenerationUseCases(repositories, projectContract);
  await app.register(campaignRoutes, { campaigns });
  await app.register(campaignSourceRoutes, { sources });
  await app.register(campaignBriefRoutes, {
    briefs,
    ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}),
  });
  await app.register(productMatchingRoutes, {
    matching,
    ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}),
  });
  await app.register(assetPoolRoutes, {
    pool,
    ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}),
  });
  await app.register(mediaSelectionRoutes, { selection, repositories });
  await app.register(generationRoutes, {
    generation,
    ...(options.projectGenerationPreparer
      ? { projectGenerationPreparer: options.projectGenerationPreparer }
      : {}),
    ...(options.projectFormatBindings
      ? { projectFormatBindings: options.projectFormatBindings }
      : {}),
    ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}),
  });
};
