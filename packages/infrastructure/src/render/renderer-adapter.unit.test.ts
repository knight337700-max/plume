import { describe, expect, it } from "vitest";
import { detectMimeType, imageDimensions } from "../files/magic-byte.js";
import { renderCreativeDocument } from "./renderer-adapter.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "profile-1",
  canvas: {
    width: 100,
    height: 60,
    colorMode: "RGB" as const,
    transparentBackground: false,
    background: "#ffffff",
  },
  elements: [
    {
      id: "shape",
      type: "SHAPE" as const,
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      zIndex: 1,
      locked: false,
      visible: true,
      style: { fill: "#ff0000" },
    },
    {
      id: "text",
      type: "TEXT" as const,
      x: 10,
      y: 35,
      width: 70,
      height: 20,
      zIndex: 2,
      locked: false,
      visible: true,
      text: "A1",
      style: { color: "#000000" },
    },
  ],
  usedAssetVersionIds: [],
  copyAssets: {},
  metadata: {
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    creativeId: "creative-1",
    productId: null,
  },
};

describe("native deterministic renderer adapter", () => {
  it("renders valid PNG bytes with stable checksums and dimensions", () => {
    const request = {
      requestId: "request-1",
      workspaceId: "workspace-1",
      creativeVersionId: "version-1",
      purpose: "PREVIEW" as const,
      creativeDocument: document,
      outputProfile: { mimeType: "image/png" as const, width: 100, height: 60 },
    };
    const first = renderCreativeDocument(request);
    const second = renderCreativeDocument(request);
    expect(first.status).toBe("COMPLETED");
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.outputBytes && detectMimeType(first.outputBytes)).toBe("image/png");
    expect(first.outputBytes && imageDimensions(first.outputBytes, "image/png")).toMatchObject({
      width: 100,
      height: 60,
    });
    expect(first.warnings).toContain("FONT_FALLBACK_USED:text");
  });

  it("fails closed for missing asset access and unsupported JPEG output", () => {
    const withAsset = {
      ...document,
      elements: [{ ...document.elements[0], assetVersionId: "asset-1" }],
      usedAssetVersionIds: ["asset-1"],
    };
    const missing = renderCreativeDocument({
      requestId: "request-1",
      workspaceId: "workspace-1",
      creativeVersionId: "version-1",
      purpose: "VALIDATION",
      creativeDocument: withAsset,
      outputProfile: { mimeType: "image/png", width: 100, height: 60 },
    });
    expect(missing).toMatchObject({ status: "FAILED", error: { code: "ASSET_ACCESS_MISSING" } });
    const jpeg = renderCreativeDocument({
      requestId: "request-1",
      workspaceId: "workspace-1",
      creativeVersionId: "version-1",
      purpose: "FINAL_EXPORT",
      creativeDocument: document,
      outputProfile: { mimeType: "image/jpeg", width: 100, height: 60 },
    });
    expect(jpeg).toMatchObject({ status: "FAILED", error: { code: "UNSUPPORTED_OUTPUT_MIME" } });
  });
});
