import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createInMemoryWorkspaceEventStream } from "../../../../../packages/infrastructure/src/events/redis-workspace-stream.js";
import { operationsRouteGroup } from "./index.js";

describe("workspace SSE route", () => {
  it("replays only events after Last-Event-ID and emits a heartbeat", async () => {
    const stream = createInMemoryWorkspaceEventStream({ clock: () => new Date("2026-07-29T12:00:00.000Z") });
    const first = await stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: { jobId: "job-1", status: "RUNNING", progressPercent: 10, currentStep: "render" } });
    await stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: { jobId: "job-1", status: "RUNNING", progressPercent: 20, currentStep: "validate" } });
    const app = Fastify({ logger: false });
    await app.register(operationsRouteGroup, { stream });
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/events/stream", headers: { "last-event-id": first.id } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-sse-heartbeat-seconds"]).toBe("20");
    expect(response.body).toContain(": heartbeat");
    expect(response.body).not.toContain(`id: ${first.id}`);
    expect(response.body).toContain('"progressPercent":20');
    expect((await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-2/events/stream" })).body).not.toContain("job-1");
    await app.close();
  });
});
