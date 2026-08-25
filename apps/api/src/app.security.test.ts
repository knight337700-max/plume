import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { buildApp } from "./app.js";
import { InMemoryMembershipStore } from "./auth/workspace-membership.js";
import {
  InMemorySessionStore,
  createSessionUseCases,
} from "../../../packages/core/src/modules/iam/session-use-cases.js";
import {
  createDeterministicUploadStorage,
  createUploadUseCases,
} from "../../../packages/core/src/modules/asset/upload-use-cases.js";

function productionApp(options: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const sessions = createSessionUseCases(new InMemorySessionStore(), {
    listWorkspacesForUser: async () => [],
  });
  const memberships = new InMemoryMembershipStore([
    { workspaceId: "ws-a", userId: "user-a", role: "OWNER", status: "ACTIVE" },
    { workspaceId: "ws-b", userId: "user-b", role: "OWNER", status: "ACTIVE" },
  ]);
  const uploads = createUploadUseCases({
    storage: createDeterministicUploadStorage(),
    bucket: "production-test",
    filePolicy: { allowedMimeTypes: ["image/png"], maxBytes: 1024, maxPixels: 100 },
  });
  return buildApp({
    securityMode: "production",
    sessions,
    memberships,
    uploads,
    sessionSecret: "production-test-session-secret-with-entropy",
    cookieSecure: true,
    cookieSameSite: "strict",
    bodyLimit: 1024,
    rateLimit: { windowMs: 60_000, maxRequests: 20 },
    publicMetrics: false,
    ...options,
  });
}

describe("Production API security composition", () => {
  it("fails closed when the production composition is incomplete", async () => {
    await expect(buildApp({ securityMode: "production" })).rejects.toThrow(
      /PRODUCTION_COMPOSITION_INCOMPLETE/,
    );
  });

  it("denies anonymous metrics and workspace-scoped routes", async () => {
    const app = await productionApp();
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-a/uploads",
      payload: { filename: "x.png", mimeType: "image/png", bytes: 1, purpose: "ASSET" },
    });
    expect(metrics.statusCode).toBe(404);
    expect([403, 404]).toContain(upload.statusCode);
    await app.close();
  });

  it("applies the configured body and rate limits", async () => {
    const bodyApp = Fastify({ bodyLimit: 32 });
    bodyApp.post("/body", async () => ({ ok: true }));
    const oversized = await bodyApp.inject({
      method: "POST",
      url: "/body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ oversized: "x".repeat(100) }),
    });
    expect(oversized.statusCode).toBe(413);
    await bodyApp.close();

    const limited = await productionApp({ rateLimit: { windowMs: 60_000, maxRequests: 1 } });
    const first = await limited.inject({ method: "GET", url: "/api/v1/auth/session" });
    const second = await limited.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBeDefined();
    await limited.close();
  });

  it("rejects the development session secret in production", async () => {
    await expect(
      productionApp({ sessionSecret: "plume-development-session-secret-change-me-32-chars" }),
    ).rejects.toThrow(/development/);
  });
});
