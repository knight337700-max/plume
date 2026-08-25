import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBullMqAdapter } from "./bullmq.js";

const runEphemeralIntegration = process.env.RUN_EPHEMERAL_INTEGRATION === "1";

describe.runIf(runEphemeralIntegration)("BullMQ ephemeral Redis integration", () => {
  it("round-trips a scoped job through Redis with one consumer", async () => {
    const prefix = `gate-i2-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const adapter = createBullMqAdapter({
      redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
      prefix,
    });
    const received: Array<{ workspaceId: string; operation: string }> = [];

    try {
      const worker = adapter.consume(
        "ephemeral",
        async (data: { workspaceId: string; operation: string }) => {
          received.push(data);
        },
        { concurrency: 1 },
      );
      await worker.waitUntilReady();
      await adapter.enqueue("ephemeral", {
        data: { workspaceId: "workspace-ephemeral", operation: "scope-check" },
        options: { attempts: 1, removeOnComplete: true },
      });

      const deadline = Date.now() + 10_000;
      while (received.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(received).toEqual([
        { workspaceId: "workspace-ephemeral", operation: "scope-check" },
      ]);
    } finally {
      await adapter.close();
    }
  });
});
