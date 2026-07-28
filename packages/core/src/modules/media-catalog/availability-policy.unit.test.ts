import { describe, expect, it } from "vitest";
import { assertCatalogAvailable, canUseCatalogStatus } from "./availability-policy.js";
describe("catalog availability policy", () => { it("allows legacy query but blocks new selection", () => { expect(canUseCatalogStatus("LEGACY_ONLY", "QUERY").allowed).toBe(true); expect(canUseCatalogStatus("LEGACY_ONLY", "SELECT").allowed).toBe(false); expect(() => assertCatalogAvailable({ status: "PENDING_VERIFY" }, "GENERATE")).toThrow("pending verification"); }); });
