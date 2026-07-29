import { describe, expect, it } from "vitest";
import { runDeterministicValidation } from "./deterministic-validator.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "kakao-bizboard",
  canvas: { width: 1029, height: 258, colorMode: "RGB" as const, transparentBackground: true },
  elements: [
    { id: "advertiser", type: "TEXT" as const, name: "ADVERTISER_IDENTITY", x: 20, y: 20, width: 100, height: 20, zIndex: 1, locked: false, visible: true, text: "Plume" },
  ],
  usedAssetVersionIds: [],
  copyAssets: {},
  metadata: { workspaceId: "workspace-1", campaignId: "campaign-1", creativeId: "creative-1", productId: null },
};

describe("deterministic validator", () => {
  it("passes a Kakao Bizboard fixture and identifies target elements on failure", () => {
    const rules = [
      { id: "KAKAO_BIZBOARD_DIMENSION", target: "CANVAS", operator: "DIMENSION_EQ", value: { width: 1029, height: 258 }, severity: "ERROR" as const, version: "1", message: "dimension" },
      { id: "KAKAO_BIZBOARD_ALPHA", target: "FILE", operator: "ALPHA_CHANNEL_EQ", value: true, severity: "ERROR" as const, version: "1", message: "alpha" },
      { id: "KAKAO_ADVERTISER", target: "ELEMENT", operator: "ELEMENT_EXISTS", value: "ADVERTISER_IDENTITY", severity: "ERROR" as const, version: "1", message: "advertiser" },
    ];
    expect(runDeterministicValidation({ creativeDocument: document, rules, file: { alpha: true, bytes: 1000, mimeType: "image/png" } }).status).toBe("PASS");
    const failed = runDeterministicValidation({ creativeDocument: { ...document, canvas: { ...document.canvas, width: 1000 } }, rules, file: { alpha: false } });
    expect(failed.status).toBe("ERROR");
    expect(failed.findings.map((finding) => finding.ruleCode)).toEqual(["KAKAO_BIZBOARD_DIMENSION", "KAKAO_BIZBOARD_ALPHA"]);
  });

  it("is deterministic for the same document and rules", () => {
    const rules = [{ id: "TEXT_LINES", target: "TEXT", operator: "TOTAL_LINES_LTE", value: 1, severity: "WARNING" as const, version: "1", message: "lines" }];
    const first = runDeterministicValidation({ creativeDocument: document, rules });
    const second = runDeterministicValidation({ creativeDocument: document, rules });
    expect(first).toEqual(second);
  });
});
