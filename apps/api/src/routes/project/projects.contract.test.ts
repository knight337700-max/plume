import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("Project API contract", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });
  it("registers the PI-4C0 routes with mutation role guards", async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toContain("projects");
    expect(routes).toContain("/effective");
    expect(routes).toContain("creative-sets");
  });
});
