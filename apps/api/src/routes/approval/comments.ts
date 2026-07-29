import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { IdempotencyRepository } from "../../idempotency/repository.js";
import { InMemoryIdempotencyRepository } from "../../idempotency/repository.js";
import { runIdempotent } from "../../idempotency/middleware.js";

export interface CommentRecord { readonly id: string; readonly workspaceId: string; readonly commentThreadId: string; readonly authorId: string; readonly parentCommentId: string | null; readonly body: string; readonly status: "ACTIVE" | "REDACTED"; readonly createdAt: string; readonly editedAt: string | null }
export interface CommentStore { list(workspaceId: string, threadId: string): Promise<readonly CommentRecord[]>; create(input: { readonly workspaceId: string; readonly commentThreadId: string; readonly authorId: string; readonly parentCommentId?: string | null; readonly body: string }): Promise<CommentRecord> }
export function createInMemoryCommentStore(seed: readonly CommentRecord[] = []): CommentStore {
  const comments = new Map(seed.map((item) => [item.id, item]));
  return { async list(workspaceId, threadId) { return [...comments.values()].filter((item) => item.workspaceId === workspaceId && item.commentThreadId === threadId).sort((left, right) => left.createdAt.localeCompare(right.createdAt)); }, async create(input) { const item: CommentRecord = Object.freeze({ id: randomUUID(), ...input, parentCommentId: input.parentCommentId ?? null, status: "ACTIVE", createdAt: new Date().toISOString(), editedAt: null }); comments.set(item.id, item); return item; } };
}
interface Params { readonly workspaceId: string; readonly threadId: string }
interface RequestLike { readonly params: Params; readonly body?: unknown; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined>; readonly session?: { readonly userId?: string } }
function request(value: unknown): RequestLike { return value as RequestLike; }
function body(value: unknown): Record<string, unknown> { const candidate = request(value).body; return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {}; }
function header(value: unknown, name: string): string | undefined { const candidate = request(value).headers?.[name.toLowerCase()]; return Array.isArray(candidate) ? candidate[0] : candidate; }
function actor(value: unknown): string { return request(value).session?.userId ?? header(value, "x-user-id") ?? "system-user"; }
export interface CommentRouteOptions { readonly store?: CommentStore; readonly idempotency?: IdempotencyRepository }
export const commentRoutes: FastifyPluginAsync<CommentRouteOptions> = async (app, options) => {
  const store = options.store ?? createInMemoryCommentStore();
  const idempotency = options.idempotency ?? new InMemoryIdempotencyRepository();
  app.get("/api/v1/workspaces/:workspaceId/comment-threads/:threadId/comments", { config: { operationId: "listComments" } }, async (value) => { const input = request(value); const items = await store.list(input.params.workspaceId, input.params.threadId); return { items, page: { limit: Number(input.query?.limit ?? 50), nextCursor: null } }; });
  app.post("/api/v1/workspaces/:workspaceId/comment-threads/:threadId/comments", { config: { operationId: "createComment", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"] } }, async (value, reply) => { const input = request(value); const payload = body(value); const result = await runIdempotent(idempotency, { workspaceId: input.params.workspaceId, key: header(value, "idempotency-key") ?? "", body: payload }, async () => ({ statusCode: 201, body: { data: await store.create({ workspaceId: input.params.workspaceId, commentThreadId: input.params.threadId, authorId: actor(value), body: String(payload.body ?? ""), ...(payload.parentCommentId === undefined ? {} : { parentCommentId: payload.parentCommentId as string | null }) }) } })); return reply.code(result.statusCode).send(result.body); });
};
