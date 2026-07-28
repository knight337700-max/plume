import type { FastifyPluginAsync } from "fastify";
import { createCampaignUseCases, type CampaignUseCases } from "../../../../../packages/core/src/modules/campaign/campaign-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { campaignRoutes } from "./campaigns.js";
import { campaignSourceRoutes } from "./sources.js";
import { campaignBriefRoutes } from "./brief.js";
import { createCampaignSourceUseCases, type CampaignSourceUseCases } from "../../../../../packages/core/src/modules/campaign/source-use-cases.js";
import { createBriefUseCases, type BriefUseCases } from "../../../../../packages/core/src/modules/campaign/brief-use-cases.js";

interface Options { readonly campaigns?: CampaignUseCases; readonly sources?: CampaignSourceUseCases; readonly briefs?: BriefUseCases }
export const campaignRouteGroup: FastifyPluginAsync<Options> = async (app, options) => {
  const repositories = createInMemoryCampaignRepositories();
  const campaigns = options.campaigns ?? createCampaignUseCases(repositories);
  const sources = options.sources ?? createCampaignSourceUseCases({ repositories, files: { async getFile(_workspaceId, id) { return { id, workspaceId: _workspaceId, status: "COMPLETED" as const }; } } });
  const briefs = options.briefs ?? createBriefUseCases(repositories);
  await app.register(campaignRoutes, { campaigns });
  await app.register(campaignSourceRoutes, { sources });
  await app.register(campaignBriefRoutes, { briefs });
};
