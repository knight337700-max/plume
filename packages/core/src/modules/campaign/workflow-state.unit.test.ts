import { describe, expect, it } from "vitest";
import { deriveWorkflowState } from "./workflow-state.js";
import type { CampaignRecord } from "./repositories.js";

const campaign: CampaignRecord = { id: "campaign-1", workspaceId: "ws-1", brandId: "brand-1", displayCode: "C-001", name: "Launch", objectiveCode: "SALES", status: "DRAFT", currentStep: "SOURCES", revisionNo: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" };

describe("campaign workflow state", () => {
  it("derives blockers from persisted state and flags stale downstream work", () => {
    const state = deriveWorkflowState({ campaign, sources: [], products: [], assetSelections: [], channels: [], formats: [] });
    expect(state.currentStep).toBe("SOURCES");
    expect(state.blockers.map((blocker) => blocker.code)).toContain("SOURCES_REQUIRED");
    const stale = deriveWorkflowState({ campaign, sources: [{ id: "source-1", workspaceId: "ws-1", campaignId: "campaign-1", fileObjectId: "file-1", sourceType: "UPLOAD", status: "ACTIVE", createdAt: "2026-01-01" }], briefVersion: { id: "brief-v2", workspaceId: "ws-1", campaignBriefId: "brief-1", versionNo: 2, sourceKind: "AI", contentJson: {}, sourceCitationsJson: [], brandProfileSnapshotJson: {}, status: "CONFIRMED", createdAt: "2026-01-01" }, matchingBriefVersionId: "brief-v1", products: [], assetSelections: [], channels: [], formats: [] });
    expect(stale.stale.matching).toBe(true);
    expect(stale.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MATCHING_STALE" })]));
  });
});
