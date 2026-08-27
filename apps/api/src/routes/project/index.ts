import type { FastifyPluginAsync } from "fastify";
import {
  createInMemoryProjectRepositories,
  type ProjectRepositories,
} from "../../../../../packages/core/src/modules/project/repositories.js";
import { createProjectUseCases } from "../../../../../packages/core/src/modules/project/project-use-cases.js";
import type {
  ProjectAssetContext,
  ProjectCampaignContext,
  ProjectUseCases,
} from "../../../../../packages/core/src/modules/project/project-use-cases.js";
import {
  createInMemoryCampaignRepositories,
  type CampaignRepositories,
} from "../../../../../packages/core/src/modules/campaign/repositories.js";
import {
  createInMemoryAssetRepositories,
  type AssetRepositories,
} from "../../../../../packages/core/src/modules/asset/repositories.js";
import {
  createInMemoryCreativeRepositories,
  type CreativeRepositories,
} from "../../../../../packages/core/src/modules/creative/repositories.js";
import { projectRoutes } from "./projects.js";
interface Options {
  projectsUseCases?: ProjectUseCases;
  projects?: ProjectRepositories;
  campaigns?: CampaignRepositories;
  assets?: AssetRepositories;
  campaignContext?: ProjectCampaignContext;
  assetContext?: ProjectAssetContext;
  creatives?: Pick<CreativeRepositories, "listCreativeSetsByProject" | "listAssetUsageGraph">;
}
export const projectRouteGroup: FastifyPluginAsync<Options> = async (app, options) => {
  const projects = options.projects ?? createInMemoryProjectRepositories();
  const campaigns =
    options.campaignContext ?? options.campaigns ?? createInMemoryCampaignRepositories();
  const assets = options.assetContext ?? options.assets ?? createInMemoryAssetRepositories();
  const creatives = options.creatives ?? createInMemoryCreativeRepositories();
  await app.register(projectRoutes, {
    projects: options.projectsUseCases ?? createProjectUseCases({ projects, campaigns, assets }),
    creatives,
  });
};
