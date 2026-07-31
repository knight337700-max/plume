import { describe, expect, it } from "vitest";
import { createRuntimeHandlerRegistry, PermanentJobError, RUNTIME_JOB_TYPES, STAGING_ENABLED_JOB_TYPES } from "./runtime-registry.js";

describe("worker runtime handler registry", () => {
  it("registers every queue and reports unconfigured job types", () => {
    const runtime = createRuntimeHandlerRegistry({});
    expect(runtime.registrations).toHaveLength(11);
    expect(runtime.missingJobTypes).toEqual(RUNTIME_JOB_TYPES);
  });

  it("dispatches configured types and rejects unknown types permanently", async () => {
    const seen: string[] = [];
    const runtime = createRuntimeHandlerRegistry({
      "catalog.integrity_check": async (job) => {
        seen.push(job.name);
        return "done";
      },
    });
    const maintenance = runtime.registrations.find((registration) => registration.queue === "maintenance");
    expect(maintenance).toBeDefined();
    await maintenance?.handler({}, { name: "catalog.integrity_check" } as never);
    expect(seen).toEqual(["catalog.integrity_check"]);
    await expect(maintenance?.handler({}, { name: "unknown.command" } as never)).rejects.toBeInstanceOf(PermanentJobError);
  });

  it("registers only the staging activation set when requested", () => {
    const handlers = Object.fromEntries(STAGING_ENABLED_JOB_TYPES.map((type) => [type, async () => undefined]));
    const runtime = createRuntimeHandlerRegistry(handlers, STAGING_ENABLED_JOB_TYPES, STAGING_ENABLED_JOB_TYPES);
    expect(runtime.missingJobTypes).toEqual([]);
    expect(runtime.registrations.map((registration) => registration.queue).sort()).toEqual([
      "ai-standard",
      "export",
      "render",
      "validation",
    ]);
    expect(runtime.registrations.flatMap((registration) => registration.messageTypes ?? []).sort()).toEqual(
      [...STAGING_ENABLED_JOB_TYPES].sort(),
    );
  });
});
