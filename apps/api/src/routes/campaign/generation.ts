import type { FastifyPluginAsync } from "fastify";
import type { GenerationUseCases } from "../../../../../packages/core/src/modules/campaign/generation-use-cases.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";
import { actorReference, headerValue } from "../../async/route-policy.js";
import type { PreparedProjectGeneration } from "../../../../../packages/core/src/modules/project/project-generation-preparer.js";
import type { DurableFormatBinding } from "../../../../../packages/infrastructure/src/db/project-format-binding-resolver.js";
interface Options {
  readonly generation: GenerationUseCases;
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
interface Params {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly requestId?: string;
}
const params = (request: unknown) => (request as { params: Params }).params;
const body = (request: unknown) =>
  ((request as { body?: unknown }).body ?? {}) as Record<string, unknown>;

export const generationRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.post(
    "/api/v1/workspaces/:workspaceId/campaigns/:campaignId/generation-requests",
    { config: { operationId: "createGenerationRequest", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = params(request);
      const value = body(request);
      const productIds = Array.isArray(value.productIds) ? value.productIds.map(String) : [];
      const formatSelectionIds = Array.isArray(value.formatSelectionIds)
        ? value.formatSelectionIds.map(String)
        : [];
      const variantCount = Math.max(1, Math.min(10, Number(value.variantCountPerProduct ?? 1)));
      const generationMode =
        value.generationMode === "CANONICAL_RENDERER" ? "CANONICAL_RENDERER" : "MOCK_AI";
      const briefVersionId = value.briefVersionId ? String(value.briefVersionId) : undefined;
      const projectId = value.projectId ? String(value.projectId) : undefined;
      if (options.asyncCommands) {
        const prepared = projectId
          ? await options.projectGenerationPreparer?.prepare({
              workspaceId: input.workspaceId,
              campaignId: input.campaignId,
              projectId,
              ...(briefVersionId ? { briefVersionId } : {}),
            })
          : undefined;
        if (projectId && !prepared)
          throw Object.assign(new Error("Project durable generation is unavailable"), {
            code: "PROJECT_DURABLE_GENERATION_UNAVAILABLE",
            statusCode: 503,
          });
        const formatBindings = projectId
          ? await options.projectFormatBindings?.resolve(
              input.workspaceId,
              input.campaignId,
              formatSelectionIds,
            )
          : undefined;
        if (projectId && !formatBindings)
          throw Object.assign(new Error("Project durable format binding is unavailable"), {
            code: "PROJECT_DURABLE_FORMAT_BINDING_UNAVAILABLE",
            statusCode: 503,
          });
        const actor = actorReference(request);
        const idempotencyKey = headerValue(request, "idempotency-key");
        const result = await options.asyncCommands.enqueue({
          workspaceId: input.workspaceId,
          command: "creative.generate",
          schemaVersion: 1,
          payload: {
            campaignId: input.campaignId,
            ...((prepared?.briefVersionId ?? briefVersionId)
              ? { briefVersionId: prepared?.briefVersionId ?? briefVersionId }
              : {}),
            productIds,
            formatProfileIds:
              formatBindings?.map((binding) => binding.canonicalFormatKey) ?? formatSelectionIds,
            variantCountPerProduct: variantCount,
            generationMode,
            ...(prepared
              ? { projectId: prepared.projectId, assetPoolSnapshot: prepared.assetPoolSnapshot }
              : {}),
            ...(formatBindings ? { formatBindings } : {}),
          },
          ...(actor ? { requestedBy: actor } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        });
        const location = `/api/v1/workspaces/${input.workspaceId}/jobs/${result.jobId}`;
        reply.header("Operation-Location", location);
        reply.header("Location", location);
        reply.header("Retry-After", "3");
        return reply
          .code(202)
          .send({ job: { id: result.jobId, status: result.status }, links: { self: location } });
      }
      const aggregate = await options.generation.create({
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        ...(projectId ? { projectId } : {}),
        ...(briefVersionId ? { briefVersionId } : {}),
        products: productIds.map((productId) => ({
          productId,
          variantKeys: Array.from({ length: variantCount }, (_, index) => `variant-${index + 1}`),
        })),
        formatProfileIds: formatSelectionIds,
      });
      const location = `/api/v1/workspaces/${input.workspaceId}/campaigns/${input.campaignId}/generation-requests/${aggregate.request.id}`;
      reply.header("Operation-Location", location);
      reply.header("Location", location);
      reply.header("Retry-After", "3");
      return reply.code(202).send({
        job: { id: aggregate.request.id, status: aggregate.request.status },
        resource: aggregate.request,
        links: { self: location },
      });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/campaigns/:campaignId/generation-requests/:requestId",
    { config: { operationId: "getGenerationRequest" } },
    async (request, reply) => {
      const input = params(request);
      const result = await options.generation.get(input.workspaceId, input.requestId!);
      if (!result || result.request.campaignId !== input.campaignId)
        return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
      return { data: result };
    },
  );
};
