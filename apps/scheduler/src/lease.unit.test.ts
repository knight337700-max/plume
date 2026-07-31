import { describe, expect, it } from "vitest";
import { createSchedulerLease, schedulerLeaseScripts, type RedisLeaseClient } from "./lease.js";

function fakeRedis(): RedisLeaseClient & { value: string | undefined; expiresAt: number | undefined } {
  const state: RedisLeaseClient & { value: string | undefined; expiresAt: number | undefined } = {
    value: undefined,
    expiresAt: undefined,
    async set(_key, value, _mode, ttlMs, _condition) {
      if (state.value && (state.expiresAt ?? 0) > Date.now()) return null;
      state.value = value;
      state.expiresAt = Date.now() + ttlMs;
      return "OK";
    },
    async eval(script, _keyCount, _key, owner, ttlMs) {
      if (state.value !== owner || (state.expiresAt ?? 0) <= Date.now()) return 0;
      if (script === schedulerLeaseScripts.renew) {
        state.expiresAt = Date.now() + Number(ttlMs);
        return 1;
      }
      state.value = undefined;
      state.expiresAt = undefined;
      return 1;
    },
    async quit() { return "OK"; },
  };
  return state;
}

describe("distributed scheduler lease", () => {
  it("allows one owner, renews it, and releases safely", async () => {
    const redis = fakeRedis();
    const first = createSchedulerLease({ key: "plume-staging:scheduler:lease", owner: "owner-1", ttlMs: 5_000, client: redis });
    const second = createSchedulerLease({ key: "plume-staging:scheduler:lease", owner: "owner-2", ttlMs: 5_000, client: redis });
    await expect(first.acquire()).resolves.toBe(true);
    await expect(second.acquire()).resolves.toBe(false);
    await expect(second.renew()).resolves.toBe(false);
    await expect(first.renew()).resolves.toBe(true);
    await first.release();
    await expect(second.acquire()).resolves.toBe(true);
    await second.release();
    await first.close();
    await second.close();
  });

  it("uses the provider-neutral queue-prefix lease key", () => {
    const redis = fakeRedis();
    const lease = createSchedulerLease({ client: redis, owner: "owner", ttlMs: 5_000 });
    expect(lease.key).toMatch(/:scheduler:lease$/u);
  });
});
