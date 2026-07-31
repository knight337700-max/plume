import type { FastifyPluginAsync } from "fastify";
import { createInMemoryValidationRepositories } from "../../../../../packages/core/src/modules/validation/repositories.js";
import { createValidationUseCases, type ValidationUseCases } from "../../../../../packages/core/src/modules/validation/use-cases.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { validationRoutes } from "./validation.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";

export interface ValidationRouteGroupOptions { readonly useCases?: ValidationUseCases; readonly idempotency?: IdempotencyRepository; readonly asyncCommands?: AsyncCommandPublisher }
export const validationRouteGroup: FastifyPluginAsync<ValidationRouteGroupOptions> = async (app, options) => {
  const repositories = createInMemoryValidationRepositories();
  await app.register(validationRoutes, { useCases: options.useCases ?? createValidationUseCases(repositories), ...(options.idempotency ? { idempotency: options.idempotency } : {}), ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}) });
};
