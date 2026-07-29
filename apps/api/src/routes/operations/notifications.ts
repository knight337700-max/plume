import type { FastifyPluginAsync } from "fastify";
import type { NotificationUseCases } from "../../../../../packages/core/src/modules/operations/notification-use-cases.js";

export interface NotificationRouteOptions { readonly useCases: NotificationUseCases }
interface Params { readonly workspaceId: string; readonly notificationId: string }
interface RequestLike { readonly params: Params; readonly query?: Record<string, unknown>; readonly headers?: Record<string, string | string[] | undefined>; readonly session?: { readonly userId?: string } }
function request(value: unknown): RequestLike { return value as RequestLike; }
function header(value: unknown, name: string): string | undefined { const candidate = request(value).headers?.[name.toLowerCase()]; return Array.isArray(candidate) ? candidate[0] : candidate; }
function userId(value: unknown): string { return request(value).session?.userId ?? header(value, "x-user-id") ?? "system-user"; }
function list(items: readonly unknown[], query?: Record<string, unknown>) { const limit = Math.max(1, Math.min(200, Number(query?.limit ?? 50))); return { items: items.slice(0, limit), page: { limit, nextCursor: null } }; }

export const notificationRoutes: FastifyPluginAsync<NotificationRouteOptions> = async (app, options) => {
  app.get("/api/v1/workspaces/:workspaceId/notifications", { config: { operationId: "listNotifications" } }, async (value) => {
    const input = request(value);
    const query = input.query ?? {};
    return list(await options.useCases.list({ workspaceId: input.params.workspaceId, userId: userId(value), unreadOnly: query.unreadOnly === true || query.unreadOnly === "true" }), query);
  });
  app.post("/api/v1/workspaces/:workspaceId/notifications/:notificationId.read", { config: { operationId: "markNotificationRead", roles: ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"] } }, async (value) => {
    const input = request(value);
    return { data: await options.useCases.markRead({ workspaceId: input.params.workspaceId, userId: userId(value), notificationId: input.params.notificationId }) };
  });
};

