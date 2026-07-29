import type { FastifyPluginAsync } from "fastify";
import { createInMemoryJobQueryRepository, createJobUseCases, type JobUseCases } from "../../../../../packages/core/src/modules/operations/job-use-cases.js";
import { jobRoutes } from "./jobs.js";

export interface OperationsRouteGroupOptions { readonly jobs?: JobUseCases }
export const operationsRouteGroup: FastifyPluginAsync<OperationsRouteGroupOptions> = async (app, options) => {
  const jobs = options.jobs ?? createJobUseCases(createInMemoryJobQueryRepository());
  await app.register(jobRoutes, { useCases: jobs });
};
