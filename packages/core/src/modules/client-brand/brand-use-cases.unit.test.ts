import { describe, expect, it } from "vitest";
import { createBrandUseCases } from "./brand-use-cases.js";
import { createAdvertiserUseCases } from "./advertiser-use-cases.js";
import { createInMemoryClientBrandRepositories } from "./repositories.js";

describe("advertiser and brand use cases", () => {
  it("preserves archived hierarchy and profile revisions", async () => {
    const repositories = createInMemoryClientBrandRepositories();
    const advertisers = createAdvertiserUseCases(repositories); const brands = createBrandUseCases(repositories);
    const advertiser = await advertisers.create("w1", { name: "Acme" });
    const brand = await brands.create("w1", advertiser.id, { name: "Brand" });
    const profile = await brands.updateProfile("w1", brand.id, { brandMessage: "Hello", toneJson: {}, colorTokensJson: {}, forbiddenExpressionsJson: [] });
    await advertisers.archive("w1", advertiser.id, advertiser.revisionNo);
    expect(await repositories.getBrand("w1", brand.id)).not.toBeNull();
    expect(profile.revisionNo).toBe(1);
  });
});
