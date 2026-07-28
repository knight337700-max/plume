import { describe, expect, it } from "vitest";
import { canUseCatalogStatus } from "../../../../../packages/core/src/modules/media-catalog/availability-policy.js";
describe("catalog admin routes", () => { it("does not make pending profiles selectable", () => { expect(canUseCatalogStatus("PENDING_VERIFY", "GENERATE").allowed).toBe(false); }); });
