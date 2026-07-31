import type { FastifyPluginAsync } from "fastify";
import { createInMemoryExportRepositories } from "../../../../../packages/core/src/modules/export/repositories.js";
import { createExportUseCases, type ExportUseCases } from "../../../../../packages/core/src/modules/export/use-cases.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { exportRoutes } from "./export.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";

export interface ExportRouteGroupOptions { readonly useCases?: ExportUseCases; readonly idempotency?: IdempotencyRepository; readonly asyncCommands?: AsyncCommandPublisher }
export const exportRouteGroup: FastifyPluginAsync<ExportRouteGroupOptions> = async (app, options) => {
  const repositories = createInMemoryExportRepositories();
  await app.register(exportRoutes, { useCases: options.useCases ?? createExportUseCases({ repositories }), ...(options.idempotency ? { idempotency: options.idempotency } : {}), ...(options.asyncCommands ? { asyncCommands: options.asyncCommands } : {}) });
};

