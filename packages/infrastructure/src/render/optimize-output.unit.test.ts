import { describe, expect, it } from "vitest";
import { renderCreativeDocument } from "./renderer-adapter.js";
import { optimizeRenderOutput } from "./optimize-output.js";

const document = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: "profile-1",
  canvas: { width: 40, height: 40, colorMode: "RGB" as const, transparentBackground: false },
  elements: [
    {
      id: "shape",
      type: "SHAPE" as const,
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      zIndex: 1,
      locked: false,
      visible: true,
      style: { fill: "#123456" },
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

describe("render output optimization", () => {
  it("recompresses PNG deterministically and enforces the byte limit", () => {
    const rendered = renderCreativeDocument({
      requestId: "request-1",
      workspaceId: "workspace-1",
      creativeVersionId: "version-1",
      purpose: "PREVIEW",
      creativeDocument: document,
      outputProfile: { mimeType: "image/png", width: 40, height: 40 },
    });
    expect(rendered.outputBytes).toBeInstanceOf(Uint8Array);
    const first = optimizeRenderOutput({ bytes: rendered.outputBytes!, mimeType: "image/png" });
    const second = optimizeRenderOutput({ bytes: rendered.outputBytes!, mimeType: "image/png" });
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.bytes).toEqual(second.bytes);
    expect(
      optimizeRenderOutput({
        bytes: first.bytes,
        mimeType: "image/png",
        maxBytes: first.optimizedBytes,
      }).withinMaxBytes,
    ).toBe(true);
    expect(
      optimizeRenderOutput({
        bytes: first.bytes,
        mimeType: "image/png",
        maxBytes: first.optimizedBytes - 1,
      }).withinMaxBytes,
    ).toBe(false);
  });
});
