import type { FastifyPluginAsync } from "fastify";
import { createInMemoryJobQueryRepository, createJobUseCases, type JobUseCases } from "../../../../../packages/core/src/modules/operations/job-use-cases.js";
import { jobRoutes } from "./jobs.js";
import { createInMemoryWorkspaceEventStream, type WorkspaceEventStream } from "../../../../../packages/infrastructure/src/events/redis-workspace-stream.js";
import { sseRoutes } from "./sse.js";

export interface OperationsRouteGroupOptions { readonly jobs?: JobUseCases; readonly stream?: WorkspaceEventStream }
export const operationsRouteGroup: FastifyPluginAsync<OperationsRouteGroupOptions> = async (app, options) => {
  const jobs = options.jobs ?? createJobUseCases(createInMemoryJobQueryRepository());
  await app.register(jobRoutes, { useCases: jobs });
  await app.register(sseRoutes, { stream: options.stream ?? createInMemoryWorkspaceEventStream() });
};
