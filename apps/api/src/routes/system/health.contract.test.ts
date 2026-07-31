import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerHealthRoute, type ReadinessChecks } from "./health.js";

function passingChecks(): ReadinessChecks {
  return {
    config: () => undefined,
    postgres: () => undefined,
    redis: () => undefined,
    storage: () => undefined,
    queue: () => undefined,
  };
}

describe("dependency-aware health routes", () => {
  it("keeps liveness independent from external dependencies", async () => {
    const app = Fastify();
    await registerHealthRoute(app, {
      readinessChecks: {
        config: () => { throw new Error("down"); },
        postgres: () => { throw new Error("down"); },
        redis: () => { throw new Error("down"); },
        storage: () => { throw new Error("down"); },
        queue: () => { throw new Error("down"); },
      },
    });
    const live = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(live.statusCode).toBe(200);
    await app.close();
  });

  it("returns ready only when every dependency check succeeds", async () => {
    const app = Fastify();
    await registerHealthRoute(app, { readinessChecks: passingChecks() });
    const ready = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ok", checks: {
      config: "ok", postgres: "ok", redis: "ok", storage: "ok", queue: "ok",
    } });
    await app.close();
  });

  it("returns redacted 503 status when a dependency is unavailable", async () => {
    const app = Fastify();
    await registerHealthRoute(app, {
      readinessChecks: { ...passingChecks(), redis: () => { throw new Error("redis://secret"); } },
    });
    const ready = await app.inject({ method: "GET", url: "/api/v1/health/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: "degraded", checks: { redis: "failed" } });
    expect(ready.body).not.toContain("secret");
    await app.close();
  });
});
