import { describe, expect, it } from "vitest";
import { hashCreativeDocument } from "./document-hash.js";
import { parseCreativeDocument, validateCreativeDocument } from "./creative-document.js";
const fixture = {
  schemaVersion: "1.0.0",
  formatProfileId: "format-1",
  canvas: { width: 1029, height: 258, colorMode: "RGB", transparentBackground: true },
  elements: [
    {
      id: "hero",
      type: "IMAGE",
      x: 0,
      y: 0,
      width: 1029,
      height: 258,
      zIndex: 0,
      locked: false,
      visible: true,
      assetVersionId: "asset-version-1",
    },
  ],
  usedAssetVersionIds: ["asset-version-1"],
  copyAssets: {},
  metadata: {
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    creativeId: "creative-1",
    productId: "product-1",
  },
} as const;
describe("Creative Document", () => {
  it("validates the official fixture and produces a stable canonical hash", () => {
    const document = parseCreativeDocument(fixture);
    const reordered = parseCreativeDocument({
      ...fixture,
      metadata: {
        productId: "product-1",
        creativeId: "creative-1",
        campaignId: "campaign-1",
        workspaceId: "workspace-1",
      },
    });
    expect(hashCreativeDocument(document)).toBe(hashCreativeDocument(reordered));
  });
  it("rejects unknown fields, duplicate element ids and unsupported elements", () => {
    expect(validateCreativeDocument({ ...fixture, unknown: true })).toContain("$.unknown");
    expect(
      validateCreativeDocument({
        ...fixture,
        elements: [{ ...fixture.elements[0] }, { ...fixture.elements[0] }],
      }),
    ).toContain("$.elements[1].id");
    expect(
      validateCreativeDocument({
        ...fixture,
        elements: [{ ...fixture.elements[0], type: "VIDEO" }],
      }),
    ).toContain("$.elements[0].type");
  });
});
