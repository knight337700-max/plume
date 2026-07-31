import type { FastifyPluginAsync } from "fastify";
import {
  createCreativeUseCases,
  type CreativeUseCases,
} from "../../../../../packages/core/src/modules/creative/creative-use-cases.js";
import { createInMemoryCreativeRepositories } from "../../../../../packages/core/src/modules/creative/repositories.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { creativeRoutes } from "./creatives.js";
import { creativeRenderRoutes } from "./renders.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";

export interface CreativeRouteGroupOptions {
  readonly useCases?: CreativeUseCases;
  readonly idempotency?: IdempotencyRepository;
  readonly asyncCommands?: AsyncCommandPublisher;
}
export const creativeRouteGroup: FastifyPluginAsync<CreativeRouteGroupOptions> = async (
  app,
  options,
) => {
  const repositories = createInMemoryCreativeRepositories();
  const useCases = options.useCases ?? createCreativeUseCases({ repositories });
  await app.register(creativeRoutes, {
    useCases,
    ...(options.idempotency ? { idempotency: options.idempotency } : {}),
    ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}),
  });
  await app.register(creativeRenderRoutes, { useCases });
};
