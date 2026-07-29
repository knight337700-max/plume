import type { FastifyPluginAsync } from "fastify";
import type { WorkspaceEventStream } from "../../../../../packages/infrastructure/src/events/redis-workspace-stream.js";

export interface SseRouteOptions { readonly stream: WorkspaceEventStream }
interface RequestLike { readonly params: { readonly workspaceId: string }; readonly headers?: Record<string, string | string[] | undefined> }
function request(value: unknown): RequestLike { return value as RequestLike; }
function header(value: unknown, name: string): string | undefined { const candidate = request(value).headers?.[name.toLowerCase()]; return Array.isArray(candidate) ? candidate[0] : candidate; }
function formatEvent(event: { readonly id: string; readonly event: string; readonly data: unknown }): string { return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`; }

export const sseRoutes: FastifyPluginAsync<SseRouteOptions> = async (app, options) => {
  app.get("/api/v1/workspaces/:workspaceId/events/stream", { config: { operationId: "streamWorkspaceEvents" } }, async (value, reply) => {
    const input = request(value);
    const events = await options.stream.read(input.params.workspaceId, header(value, "last-event-id") ?? null);
    reply.header("Content-Type", "text/event-stream").header("Cache-Control", "no-cache").header("Connection", "keep-alive").header("X-SSE-Heartbeat-Seconds", "20");
    return reply.send(`: heartbeat\n\n${events.map(formatEvent).join("")}`);
  });
};

