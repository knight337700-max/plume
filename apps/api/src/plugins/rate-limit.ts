import type { FastifyPluginAsync, FastifyRequest } from "fastify";

export interface RateLimitPluginOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function requestScope(request: FastifyRequest): string {
  const sessionUserId = (request as unknown as { session?: { userId?: string } }).session?.userId;
  const workspaceId = (request.params as { workspaceId?: string } | undefined)?.workspaceId;
  const actor = sessionUserId ? `user:${sessionUserId}` : `ip:${request.ip}`;
  return `${actor}|workspace:${workspaceId ?? "none"}`;
}

export function createRateLimitPlugin(options: RateLimitPluginOptions): FastifyPluginAsync {
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1)
    throw new Error("RATE_LIMIT_WINDOW_MS must be a positive integer");
  if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1)
    throw new Error("RATE_LIMIT_MAX_REQUESTS must be a positive integer");
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return async (app) => {
    app.addHook("onRequest", async (request, reply) => {
      const current = now();
      const key = requestScope(request);
      const existing = buckets.get(key);
      const bucket =
        !existing || existing.resetAt <= current
          ? { count: 0, resetAt: current + options.windowMs }
          : existing;
      bucket.count += 1;
      buckets.set(key, bucket);
      if (bucket.count <= options.maxRequests) return;
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - current) / 1000));
      reply.header("retry-after", String(retryAfter));
      const error = new Error("Rate limit exceeded");
      Object.assign(error, { code: "RATE_LIMIT_EXCEEDED", statusCode: 429 });
      throw error;
    });
  };
}
