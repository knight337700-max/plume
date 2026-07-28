import type { FastifyPluginAsync } from "fastify";
import { createCampaignUseCases, type CampaignUseCases } from "../../../../../packages/core/src/modules/campaign/campaign-use-cases.js";
import { createInMemoryCampaignRepositories } from "../../../../../packages/core/src/modules/campaign/repositories.js";
import { campaignRoutes } from "./campaigns.js";

interface Options { readonly campaigns?: CampaignUseCases }
export const campaignRouteGroup: FastifyPluginAsync<Options> = async (app, options) => { await app.register(campaignRoutes, { campaigns: options.campaigns ?? createCampaignUseCases(createInMemoryCampaignRepositories()) }); };
