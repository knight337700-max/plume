import { describe, expect, it } from "vitest";
import { createSchedulerBootstrap } from "./main.js";
import type { SchedulerLease } from "./lease.js";

function fakeLease(acquired = true): SchedulerLease {
  let owner = false;
  return {
    key: "plume-staging:scheduler:lease",
    owner: "owner-1",
    ttlMs: 5_000,
    async acquire() { owner = acquired; return owner; },
    async renew() { return owner; },
    async release() { owner = false; },
    isOwner() { return owner; },
    async close() { owner = false; },
  };
}

describe("scheduler readiness", () => {
  it("reports not-ready when Redis or config checks fail", async () => {
    const bootstrap = createSchedulerBootstrap([], fakeLease(), [
      { name: "redis", check: () => { throw new Error("down"); } },
    ]);
    await expect(bootstrap.start()).resolves.toBe(false);
    expect(bootstrap.health()).toMatchObject({ status: "not-ready", failedChecks: ["redis"] });
  });

  it("reports ready only after the distributed lease is acquired", async () => {
    const bootstrap = createSchedulerBootstrap([], fakeLease());
    await expect(bootstrap.start()).resolves.toBe(true);
    expect(bootstrap.health()).toMatchObject({ status: "ready", failedChecks: [] });
    await bootstrap.stop();
    expect(bootstrap.health().status).toBe("stopped");
  });

  it("reports lease failure as not-ready", async () => {
    const bootstrap = createSchedulerBootstrap([], fakeLease(false));
    await expect(bootstrap.start()).resolves.toBe(false);
    expect(bootstrap.health()).toMatchObject({ status: "not-ready", failedChecks: ["lease"] });
  });
});
