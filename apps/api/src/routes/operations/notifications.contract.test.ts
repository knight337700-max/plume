import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createInMemoryNotificationRepository, createNotificationUseCases } from "../../../../../packages/core/src/modules/operations/notification-use-cases.js";
import { operationsRouteGroup } from "./index.js";

describe("notification routes", () => {
  it("scopes notifications to the user and makes mark-read idempotent", async () => {
    const repository = createInMemoryNotificationRepository([], () => new Date("2026-07-29T12:00:00.000Z"));
    await repository.create({ id: "n-1", workspaceId: "ws-1", userId: "user-1", notificationType: "JOB", title: "Done", body: "Job done", deepLink: "/jobs/1" });
    await repository.create({ id: "n-2", workspaceId: "ws-1", userId: "user-2", notificationType: "JOB", title: "Other", body: "Other" });
    const app = Fastify({ logger: false });
    await app.register(operationsRouteGroup, { notifications: createNotificationUseCases(repository) });
    const list = await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/notifications", headers: { "x-user-id": "user-1" } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: { id: string }) => item.id)).toEqual(["n-1"]);
    const firstRead = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/notifications/n-1.read", headers: { "x-user-id": "user-1" } });
    const secondRead = await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/notifications/n-1.read", headers: { "x-user-id": "user-1" } });
    expect(firstRead.statusCode).toBe(200);
    expect(secondRead.json().data.readAt).toBe(firstRead.json().data.readAt);
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/notifications", headers: { "x-user-id": "user-2" } })).json().items).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: "/api/v1/workspaces/ws-1/notifications/n-1.read", headers: { "x-user-id": "user-2" } })).statusCode).toBe(404);
    await app.close();
  });
});

