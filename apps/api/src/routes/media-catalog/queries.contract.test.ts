import { describe, expect, it } from "vitest";
import { canUseCatalogStatus } from "../../../../../packages/core/src/modules/media-catalog/availability-policy.js";
describe("catalog query routes", () => { it("keeps legacy profiles queryable", () => { expect(canUseCatalogStatus("LEGACY_ONLY", "QUERY").allowed).toBe(true); }); });
