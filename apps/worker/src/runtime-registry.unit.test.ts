import { describe, expect, it } from "vitest";
import { createRuntimeHandlerRegistry, PermanentJobError, RUNTIME_JOB_TYPES } from "./runtime-registry.js";

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
});
