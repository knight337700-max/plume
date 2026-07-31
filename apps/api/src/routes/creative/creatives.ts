import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { EditOperationBatch } from "../../../../../packages/core/src/modules/creative/apply-edit-operations.js";
import type { CreativeDocument } from "../../../../../packages/core/src/modules/creative/creative-document.js";
import type { CreativeUseCases } from "../../../../../packages/core/src/modules/creative/creative-use-cases.js";
import type { CreativeVersionRecord } from "../../../../../packages/core/src/modules/creative/repositories.js";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { runIdempotent } from "../../idempotency/middleware.js";
import { InMemoryIdempotencyRepository } from "../../idempotency/repository.js";
import { etagForRevision, revisionFromEtag } from "../../concurrency/etag.js";
import { preconditionError } from "../../concurrency/precondition.js";
import type { AsyncCommandPublisher } from "../../../../../packages/core/src/async/command-publisher.js";
import { jobTypeNotEnabled } from "../../async/route-policy.js";

export interface CreativeRouteOptions {
  readonly useCases: CreativeUseCases;
  readonly idempotency?: IdempotencyRepository;
  readonly asyncCommands?: AsyncCommandPublisher;
}
interface Params {
  readonly workspaceId: string;
  readonly campaignId?: string;
  readonly creativeSetId?: string;
  readonly creativeId?: string;
  readonly versionId?: string;
}
type RequestLike = {
  readonly params: Params;
  readonly body?: unknown;
  readonly query?: Record<string, unknown>;
  readonly headers?: Record<string, string | string[] | undefined>;
};
function requestParams(request: unknown): Params {
  return (request as RequestLike).params;
}
function body(request: unknown): Record<string, unknown> {
  const value = (request as RequestLike).body;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function header(request: unknown, name: string): string | undefined {
  const value = (request as RequestLike).headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
function requiredRevision(request: unknown): number {
  const value = header(request, "if-match");
  if (!value) throw preconditionError("If-Match is required for this mutation");
  try {
    return revisionFromEtag(value);
  } catch {
    throw preconditionError("If-Match must contain a revision ETag");
  }
}
function requiredIdempotencyKey(request: unknown): string {
  return header(request, "idempotency-key") ?? "";
}
function query(request: unknown): Record<string, unknown> {
  return ((request as RequestLike).query ?? {}) as Record<string, unknown>;
}
function operationBatch(value: Record<string, unknown>): EditOperationBatch {
  const candidate = value.operationBatch ?? value.batch;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw new Error("operationBatch is required");
  return candidate as EditOperationBatch;
}
function responseLocation(workspaceId: string, jobId: string): string {
  return `/api/v1/workspaces/${workspaceId}/jobs/${jobId}`;
}

async function idempotent(
  repository: IdempotencyRepository,
  request: unknown,
  handler: () => Promise<{ readonly statusCode: number; readonly body: unknown }>,
): Promise<{ readonly statusCode: number; readonly body: unknown }> {
  const input = requestParams(request);
  return runIdempotent(
    repository,
    { workspaceId: input.workspaceId, key: requiredIdempotencyKey(request), body: body(request) },
    handler,
  );
}

export const creativeRoutes: FastifyPluginAsync<CreativeRouteOptions> = async (app, options) => {
  const idempotency = options.idempotency ?? new InMemoryIdempotencyRepository();
  const useCases = options.useCases;

  app.get(
    "/api/v1/workspaces/:workspaceId/campaigns/:campaignId/creative-sets",
    { config: { operationId: "listCreativeSets" } },
    async (request) => {
      const input = requestParams(request);
      const items = await useCases.listSets(input.workspaceId, input.campaignId);
      return { items, page: { limit: Number(query(request).limit ?? 50), nextCursor: null } };
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/creative-sets/:creativeSetId",
    { config: { operationId: "getCreativeSet" } },
    async (request, reply) => {
      const input = requestParams(request);
      const item = await useCases.getSet(input.workspaceId, input.creativeSetId!);
      if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/creative-sets/:creativeSetId/creatives",
    { config: { operationId: "listCreatives" } },
    async (request) => {
      const input = requestParams(request);
      const items = await useCases.list(input.workspaceId, input.creativeSetId);
      return { items, page: { limit: Number(query(request).limit ?? 50), nextCursor: null } };
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/creatives/:creativeId",
    { config: { operationId: "getCreative" } },
    async (request, reply) => {
      const input = requestParams(request);
      const item = await useCases.get(input.workspaceId, input.creativeId!);
      if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/creatives/:creativeId",
    { config: { operationId: "archiveCreative", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const item = await useCases.archive(
        input.workspaceId,
        input.creativeId!,
        requiredRevision(request),
      );
      reply.header("ETag", etagForRevision(item.revisionNo));
      return reply.code(204).send();
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creatives/:creativeId.duplicate",
    { config: { operationId: "duplicateCreative", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const value = body(request);
      const result = await idempotent(idempotency, request, async () => ({
        statusCode: 200,
        body: {
          data: await useCases.duplicate({
            workspaceId: requestParams(request).workspaceId,
            creativeId: requestParams(request).creativeId!,
            targetCreativeSetId:
              typeof value.targetCreativeSetId === "string" ? value.targetCreativeSetId : null,
          }),
        },
      }));
      return reply.code(result.statusCode).send(result.body);
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/creatives/:creativeId/versions",
    { config: { operationId: "listCreativeVersions" } },
    async (request) => {
      const input = requestParams(request);
      return {
        items: await useCases.listVersions(input.workspaceId, input.creativeId!),
        page: { limit: Number(query(request).limit ?? 50), nextCursor: null },
      };
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creatives/:creativeId/versions",
    { config: { operationId: "createCreativeVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const value = body(request);
      const result = await idempotent(idempotency, request, async () => {
        const source = await useCases.getVersion(input.workspaceId, String(value.sourceVersionId));
        if (!source || source.creativeId !== input.creativeId)
          return { statusCode: 404, body: { code: "RESOURCE_NOT_FOUND" } };
        const version = await useCases.createVersion({
          workspaceId: input.workspaceId,
          creativeId: input.creativeId!,
          parentVersionId: source.id,
          formatProfileId: source.formatProfileId,
          layoutTemplateId: source.layoutTemplateId ?? null,
          briefVersionId: source.briefVersionId,
          documentJson: source.documentJson,
          copyAssetsJson: source.copyAssetsJson,
          generationMetadataJson: {
            ...source.generationMetadataJson,
            reason: value.reason ?? null,
          },
        });
        return { statusCode: 201, body: { data: version } };
      });
      reply.header(
        "ETag",
        etagForRevision((result.body as { data?: CreativeVersionRecord }).data?.revisionNo ?? 1),
      );
      return reply.code(result.statusCode).send(result.body);
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId",
    { config: { operationId: "getCreativeVersion" } },
    async (request, reply) => {
      const input = requestParams(request);
      const item = await useCases.getVersion(input.workspaceId, input.versionId!);
      if (!item) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId",
    { config: { operationId: "updateDraftCreativeVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const value = body(request);
      const current = await useCases.getVersion(input.workspaceId, input.versionId!);
      if (!current) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
      const document = (value.document ?? value.documentJson) as CreativeDocument | undefined;
      if (!document) throw new Error("document is required");
      const item = await useCases.autosave({
        workspaceId: input.workspaceId,
        versionId: input.versionId!,
        documentJson: document,
        expectedRevision: requiredRevision(request),
        ...(value.copyAssets
          ? { copyAssetsJson: value.copyAssets as Record<string, unknown> }
          : {}),
        ...(value.generationMetadata
          ? { generationMetadataJson: value.generationMetadata as Record<string, unknown> }
          : {}),
      });
      reply.header("ETag", etagForRevision(item.revisionNo));
      return { data: item };
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId/operations.preview",
    { config: { operationId: "previewEditOperations", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const value = body(request);
      const result = await idempotent(idempotency, request, async () => {
        if (value.operationBatch || value.batch)
          await useCases.previewEdit({
            workspaceId: input.workspaceId,
            versionId: input.versionId!,
            batch: operationBatch(value),
          });
        const jobId = randomUUID();
        const location = responseLocation(input.workspaceId, jobId);
        return {
          statusCode: 202,
          body: { job: { id: jobId, status: "QUEUED" }, links: { self: location } },
        };
      });
      const jobId = (result.body as { job?: { id?: string } }).job?.id ?? randomUUID();
      reply.header("Operation-Location", responseLocation(input.workspaceId, jobId));
      reply.header("Location", responseLocation(input.workspaceId, jobId));
      reply.header("Retry-After", "3");
      return reply.code(result.statusCode).send(result.body);
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId/operations.apply",
    { config: { operationId: "applyEditOperations", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const value = body(request);
      const result = await idempotent(idempotency, request, async () => ({
        statusCode: 200,
        body: {
          data: await useCases.applyEdit({
            workspaceId: input.workspaceId,
            versionId: input.versionId!,
            batch: operationBatch(value),
            confirmed: value.confirmed !== false,
            expectedRevision: requiredRevision(request),
          }),
        },
      }));
      const version = (result.body as { data?: CreativeVersionRecord }).data;
      if (version) reply.header("ETag", etagForRevision(version.revisionNo));
      return reply.code(result.statusCode).send(result.body);
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId.render",
    { config: { operationId: "renderCreativeVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const value = body(request);
      const result = await idempotent(idempotency, request, async () => {
        const requestedPurpose = value.purpose;
        const purpose =
          requestedPurpose === "VALIDATION" || requestedPurpose === "FINAL_EXPORT"
            ? requestedPurpose
            : "PREVIEW";
        if (options.asyncCommands) jobTypeNotEnabled("creative.render");
        const job = await useCases.requestRender({
          workspaceId: input.workspaceId,
          versionId: input.versionId!,
          purpose,
          idempotencyKey: requiredIdempotencyKey(request),
        });
        const location = responseLocation(input.workspaceId, job.id);
        return { statusCode: 202, body: { job, links: { self: location } } };
      });
      const jobId = (result.body as { job?: { id?: string } }).job?.id ?? randomUUID();
      reply.header("Operation-Location", responseLocation(input.workspaceId, jobId));
      reply.header("Location", responseLocation(input.workspaceId, jobId));
      reply.header("Retry-After", "3");
      return reply.code(result.statusCode).send(result.body);
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/creative-versions/:versionId.freeze",
    { config: { operationId: "freezeCreativeVersion", roles: ["OWNER", "ADMIN", "EDITOR"] } },
    async (request, reply) => {
      const input = requestParams(request);
      const result = await idempotent(idempotency, request, async () => ({
        statusCode: 200,
        body: { data: await useCases.freezeVersion(input.workspaceId, input.versionId!) },
      }));
      const version = (result.body as { data?: CreativeVersionRecord }).data;
      if (version) reply.header("ETag", etagForRevision(version.revisionNo));
      return reply.code(result.statusCode).send(result.body);
    },
  );
};
