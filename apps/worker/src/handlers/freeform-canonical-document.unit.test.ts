import { describe, expect, it } from "vitest";
import {
  loadFreeformFontRegistry,
  loadFreeformFormatProfileRegistry,
  type CreativeLayoutPlan,
} from "../../../../packages/renderer-vendor/src/public.js";
import {
  createFreeformLayoutEvidence,
  getKakaoDisplayNative21FormatProfile,
} from "../../../../packages/infrastructure/src/render/freeform-layout-contract.js";
import { createFreeformCanonicalDocument } from "./freeform-canonical-document.js";

const runtimeRoot = "packages/renderer-vendor/upstream";
const profile = getKakaoDisplayNative21FormatProfile(
  loadFreeformFormatProfileRegistry(runtimeRoot).profiles.find(
    (candidate) => candidate.formatProfileId === "KAKAO_DISPLAY_NATIVE_2_1",
  ),
);
const fontRegistry = loadFreeformFontRegistry(runtimeRoot);
const copy = { headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" } as const;

function plan(): CreativeLayoutPlan {
  return {
    schemaVersion: "1.0.0",
    formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
    source: "AGENT",
    background: { type: "SOLID", color: "#FFFFFF" },
    elements: [
      {
        id: "image-primary",
        type: "IMAGE",
        bounds: { x: 0.55, y: 0.08, width: 0.4, height: 0.84 },
        zIndex: 0,
        role: "PRIMARY_IMAGE",
        placement: {
          policy: "ALPHA_TRIM_CONTAIN",
          source: "AGENT",
          fitMode: "CONTAIN",
          anchor: "CENTER",
          subjectProtection: "NONE",
        },
        assetId: "asset-version-1",
      },
      {
        id: "headline",
        type: "TEXT",
        bounds: { x: 0.06, y: 0.16, width: 0.42, height: 0.2 },
        zIndex: 1,
        role: "HEADLINE",
        text: copy.headline,
        fontId: "SPOQA_HAN_SANS_BOLD",
        fontSizePx: 48,
        color: "#111111",
        lineHeightPx: 56,
        textAlign: "LEFT",
        verticalAlign: "TOP",
        wrapMode: "NO_WRAP",
        overflowMode: "ERROR",
      },
      {
        id: "subcopy",
        type: "TEXT",
        bounds: { x: 0.06, y: 0.42, width: 0.42, height: 0.16 },
        zIndex: 2,
        role: "SUBCOPY",
        text: copy.subcopy,
        fontId: "SPOQA_HAN_SANS_REGULAR",
        fontSizePx: 24,
        color: "#333333",
        lineHeightPx: 32,
        textAlign: "LEFT",
        verticalAlign: "TOP",
        wrapMode: "NO_WRAP",
        overflowMode: "ERROR",
      },
    ],
  };
}

function document() {
  const evidence = createFreeformLayoutEvidence(plan(), {
    expectedRendererAssetId: "asset-version-1",
    confirmedCopy: copy,
    profile,
    fontRegistry,
  });
  return createFreeformCanonicalDocument({
    workspaceId: "workspace-freeform",
    campaignId: "campaign-freeform",
    creativeId: "creative-freeform",
    productId: "product-freeform",
    briefVersionId: "brief-freeform",
    assetVersionId: "asset-version-1",
    advertiser: "자코모",
    confirmedCopy: copy,
    evidence,
    profile,
    fontRegistry,
  });
}

describe("FREEFORM CreativeDocument compatibility projection", () => {
  it("projects the exact evidence into a parseable 1200x600 document", () => {
    const result = document();
    expect(result.canvas).toMatchObject({ width: 1200, height: 600, transparentBackground: false });
    expect(result.layoutTemplateId).toBeNull();
    expect(result.elements).toHaveLength(3);
    expect(result.usedAssetVersionIds).toEqual(["asset-version-1"]);
    expect(result.metadata.freeformLayoutEvidence).toMatchObject({
      schemaVersion: "1.0.0",
      rendererFormatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
    });
  });

  it("preserves exact text and asset identity in the derived view", () => {
    const result = document();
    expect(result.copyAssets).toEqual({ advertiser: "자코모", ...copy });
    expect(result.elements.find((element) => element.type === "IMAGE")).toMatchObject({
      assetVersionId: "asset-version-1",
      x: 660,
      y: 48,
      width: 480,
      height: 504,
    });
    expect(
      result.elements.find(
        (element) => element.type === "TEXT" && element.textSlotCode === "HEADLINE",
      ),
    ).toMatchObject({
      text: copy.headline,
      style: { fontId: "SPOQA_HAN_SANS_BOLD" },
    });
  });

  it("does not let derived element edits mutate the authoritative evidence", () => {
    const result = document();
    const evidence = result.metadata.freeformLayoutEvidence as {
      readonly creativeLayoutPlan: CreativeLayoutPlan;
    };
    const projected = result.elements[0] as unknown as Record<string, unknown>;
    projected.x = 1;
    expect(evidence.creativeLayoutPlan.elements[0]?.bounds.x).toBe(0.55);
  });

  it("keeps the projection metadata key singular and authoritative", () => {
    const result = document();
    expect(Object.keys(result.metadata)).toEqual([
      "workspaceId",
      "campaignId",
      "creativeId",
      "productId",
      "briefVersionId",
      "renderMode",
      "layoutMode",
      "freeformLayoutEvidence",
    ]);
    expect(result.metadata.layoutMode).toBe("FREEFORM");
  });
});
