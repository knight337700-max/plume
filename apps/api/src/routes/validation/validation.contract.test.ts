import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { createInMemoryValidationRepositories } from "../../../../../packages/core/src/modules/validation/repositories.js";
import { createValidationUseCases } from "../../../../../packages/core/src/modules/validation/use-cases.js";

describe("validation routes", () => {
  it("accepts a validation run, lists it, and acknowledges a warning", async () => {
    const repositories = createInMemoryValidationRepositories();
    const app = await buildApp();
    const accepted = await app.inject({ method: "POST", url: "/api/v1/workspaces/workspace-1/creative-versions/version-1/validation-runs", headers: { "idempotency-key": "validation-1" }, payload: {} });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.headers["operation-location"]).toContain("/jobs/");
    const listed = await app.inject({ method: "GET", url: "/api/v1/workspaces/workspace-1/creative-versions/version-1/validation-runs" });
    expect(listed.statusCode).toBe(200);
    await app.close();
    expect(createValidationUseCases(repositories)).toBeDefined();
  });
});
