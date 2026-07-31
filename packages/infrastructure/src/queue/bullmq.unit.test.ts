import { describe, expect, it } from "vitest";
import { BullMqAdapter } from "./bullmq.js";

describe("BullMQ queue prefix", () => {
  it("uses QUEUE_PREFIX instead of NODE_ENV", () => {
    const previousPrefix = process.env.QUEUE_PREFIX;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.QUEUE_PREFIX = "plume-staging";
    process.env.NODE_ENV = "production";
    try {
      const adapter = new BullMqAdapter({ redisUrl: "redis://localhost:6379" });
      expect(adapter.queuePrefix).toBe("plume-staging");
      expect(adapter.queueName("default")).toBe("plume-staging:default");
    } finally {
      if (previousPrefix === undefined) delete process.env.QUEUE_PREFIX;
      else process.env.QUEUE_PREFIX = previousPrefix;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
