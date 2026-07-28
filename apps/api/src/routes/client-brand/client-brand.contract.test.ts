import { describe, expect, it } from "vitest";
import { createInMemoryClientBrandRepositories } from "../../../../../packages/core/src/modules/client-brand/repositories.js";
describe("client-brand route contract", () => { it("archives with a revision-bearing resource", async () => { const r = createInMemoryClientBrandRepositories(); const a = await r.createAdvertiser({ workspaceId: "w1", name: "Acme" }); const archived = await r.archiveAdvertiser("w1", a.id); expect(archived.status).toBe("ARCHIVED"); expect(archived.revisionNo).toBe(2); }); });
