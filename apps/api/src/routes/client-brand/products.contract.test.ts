import { describe, expect, it } from "vitest";
import { createInMemoryClientBrandRepositories } from "../../../../../packages/core/src/modules/client-brand/repositories.js";
import { createProductUseCases } from "../../../../../packages/core/src/modules/client-brand/product-use-cases.js";
describe("product route contract", () => { it("returns an async location for import", async () => { const useCases = createProductUseCases(createInMemoryClientBrandRepositories()); const result = await useCases.createImport("w1", []); expect(result.job.status).toBe("QUEUED"); expect(result.job.id).toBeTruthy(); }); });
