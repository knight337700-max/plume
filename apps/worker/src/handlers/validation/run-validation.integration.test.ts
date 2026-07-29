import { describe, expect, it } from "vitest";
import { createInMemoryValidationRepositories } from "../../../../../packages/core/src/modules/validation/repositories.js";
import { createValidationWorkerHandler } from "./run-validation.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "profile-1",
  canvas: { width: 1029, height: 258, colorMode: "RGB" as const, transparentBackground: true },
  elements: [],
  usedAssetVersionIds: [],
  copyAssets: {},
  metadata: { workspaceId: "workspace-1", campaignId: "campaign-1", creativeId: "creative-1", productId: null },
};

describe("validation worker", () => {
  it("persists independent pass, warning and error runs and reuses completed run", async () => {
    const repositories = createInMemoryValidationRepositories();
    const worker = createValidationWorkerHandler({ repositories });
    const base = { workspaceId: "workspace-1", creativeVersionId: "version-1", creativeDocument: document, ruleSnapshot: { sourceVersion: "rules-1", rules: [] } };
    const pass = await worker.handle({ ...base, validationRunId: "run-pass" });
    const warning = await worker.handle({ ...base, validationRunId: "run-warning", ruleSnapshot: { sourceVersion: "rules-1", rules: [{ id: "WARNING", target: "TEXT", operator: "TOTAL_LINES_LTE", value: -1, severity: "WARNING", message: "copy" }] } });
    const error = await worker.handle({ ...base, validationRunId: "run-error", ruleSnapshot: { sourceVersion: "rules-1", rules: [{ id: "ERROR", target: "CANVAS", operator: "DIMENSION_EQ", value: { width: 1, height: 1 }, severity: "ERROR", message: "dimension" }] } });
    expect([pass.status, warning.status, error.status]).toEqual(["PASS", "WARNING", "ERROR"]);
    const replay = await worker.handle({ ...base, validationRunId: "run-error", ruleSnapshot: { sourceVersion: "rules-2", rules: [] } });
    expect(replay.resultCount).toBe(error.resultCount);
    expect((await repositories.listRuns("workspace-1", "version-1")).map((run) => run.runNo)).toEqual([3, 2, 1]);
  });
});
