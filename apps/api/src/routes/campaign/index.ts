import type { FastifyPluginAsync } from "fastify";
import { createCampaignUseCases, type CampaignUseCases } from "../../../../../packages/core/src/modules/campaign/campaign-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { campaignRoutes } from "./campaigns.js";
import { campaignSourceRoutes } from "./sources.js";
import { campaignBriefRoutes } from "./brief.js";
import { createCampaignSourceUseCases, type CampaignSourceUseCases } from "../../../../../packages/core/src/modules/campaign/source-use-cases.js";
import { createBriefUseCases, type BriefUseCases } from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";
import { createProductMatchingUseCases, type ProductMatchingUseCases } from "../../../../../packages/core/src/modules/campaign/product-matching-use-cases.js";
import { createCampaignAssetPoolUseCases, type CampaignAssetPoolUseCases } from "../../../../../packages/core/src/modules/campaign/asset-pool-use-cases.js";
import { productMatchingRoutes } from "./product-matching.js";
import { assetPoolRoutes } from "./asset-pool.js";
import { createMediaSelectionUseCases, type MediaSelectionUseCases } from "../../../../../packages/core/src/modules/campaign/media-selection-use-cases.js";
import { createInMemoryCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";
import { mediaSelectionRoutes } from "./media-selection.js";

interface Options { readonly campaigns?: CampaignUseCases; readonly sources?: CampaignSourceUseCases; readonly briefs?: BriefUseCases; readonly matching?: ProductMatchingUseCases; readonly pool?: CampaignAssetPoolUseCases; readonly selection?: MediaSelectionUseCases }
export const campaignRouteGroup: FastifyPluginAsync<Options> = async (app, options) => {
  const repositories = createInMemoryCampaignRepositories();
  const campaigns = options.campaigns ?? createCampaignUseCases(repositories);
  const sources = options.sources ?? createCampaignSourceUseCases({ repositories, files: { async getFile(_workspaceId, id) { return { id, workspaceId: _workspaceId, status: "COMPLETED" as const }; } } });
  const briefs = options.briefs ?? createBriefUseCases(repositories);
  const matching = options.matching ?? createProductMatchingUseCases(repositories);
  const pool = options.pool ?? createCampaignAssetPoolUseCases(repositories);
  const campaignCatalog = createInMemoryCatalogRepository();
  const selection = options.selection ?? createMediaSelectionUseCases(campaignCatalog);
  await app.register(campaignRoutes, { campaigns });
  await app.register(campaignSourceRoutes, { sources });
  await app.register(campaignBriefRoutes, { briefs });
  await app.register(productMatchingRoutes, { matching });
  await app.register(assetPoolRoutes, { pool });
  await app.register(mediaSelectionRoutes, { selection, repositories });
};
