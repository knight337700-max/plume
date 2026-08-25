import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREEFORM_CANONICAL_SCHEMA_SHA256,
  FREEFORM_CANONICAL_SCHEMA_VERSION,
  FREEFORM_FONT_REGISTRY_SHA256,
  FREEFORM_FORMAT_PROFILE_REGISTRY_SHA256,
  loadCanonicalCreativeLayoutPlanSchema,
  loadFreeformFontRegistry,
  loadFreeformFormatProfileRegistry,
} from "@plume/renderer-vendor";
import {
  FREEFORM_LAYOUT_EVIDENCE_METADATA_KEY,
  FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION,
  FREEFORM_OUTPUT_MAPPING,
  FREEFORM_PLUME_FORMAT_PROFILE_ID,
  FREEFORM_RENDERER_FORMAT_PROFILE_ID,
  assertFreeformLayoutContract,
  createFreeformLayoutEvidence,
  freeformLayoutPlanSha256,
  getKakaoDisplayNative21FormatProfile,
  validateFreeformLayoutContract,
  validateFreeformLayoutEvidence,
} from "./freeform-layout-contract.js";
import {
  KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING,
  PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
  resolveCanonicalRendererBinding,
} from "./renderer-bindings.js";

const runtimeRoot = path.join(process.cwd(), "packages/renderer-vendor/upstream");
const profileRegistry = loadFreeformFormatProfileRegistry(runtimeRoot);
const fontRegistry = loadFreeformFontRegistry(runtimeRoot);
const targetProfile = getKakaoDisplayNative21FormatProfile(
  profileRegistry.profiles.find(
    (profile) => profile.formatProfileId === FREEFORM_RENDERER_FORMAT_PROFILE_ID,
  ),
);

const copy = { headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" } as const;

function plan(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1.0.0" as const,
    formatProfileId: FREEFORM_RENDERER_FORMAT_PROFILE_ID,
    source: "AGENT" as const,
    background: { type: "SOLID" as const, color: "#FFFFFF" },
    elements: [
      {
        id: "image-primary",
        type: "IMAGE" as const,
        bounds: { x: 0.55, y: 0.08, width: 0.4, height: 0.84 },
        zIndex: 0,
        role: "PRIMARY_IMAGE" as const,
        placement: {
          policy: "ALPHA_TRIM_CONTAIN" as const,
          source: "AGENT" as const,
          fitMode: "CONTAIN" as const,
          anchor: "CENTER" as const,
          subjectProtection: "NONE" as const,
        },
        assetId: "asset-primary",
      },
      {
        id: "headline",
        type: "TEXT" as const,
        bounds: { x: 0.06, y: 0.16, width: 0.42, height: 0.2 },
        zIndex: 1,
        role: "HEADLINE" as const,
        text: copy.headline,
        fontId: "SPOQA_HAN_SANS_BOLD",
        fontSizePx: 48,
        color: "#111111",
        lineHeightPx: 56,
        textAlign: "LEFT" as const,
        verticalAlign: "TOP" as const,
        wrapMode: "NO_WRAP" as const,
        overflowMode: "ERROR" as const,
      },
      {
        id: "subcopy",
        type: "TEXT" as const,
        bounds: { x: 0.06, y: 0.42, width: 0.42, height: 0.16 },
        zIndex: 2,
        role: "SUBCOPY" as const,
        text: copy.subcopy,
        fontId: "SPOQA_HAN_SANS_REGULAR",
        fontSizePx: 24,
        color: "#333333",
        lineHeightPx: 32,
        textAlign: "LEFT" as const,
        verticalAlign: "TOP" as const,
        wrapMode: "NO_WRAP" as const,
        overflowMode: "ERROR" as const,
      },
    ],
    ...overrides,
  };
}

const expectation = {
  expectedRendererAssetId: "asset-primary",
  confirmedCopy: copy,
  profile: targetProfile,
  fontRegistry,
};

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("PI-3B FREEFORM contract mapping", () => {
  it("loads the frozen schema and registry closure byte-exactly", () => {
    const schema = loadCanonicalCreativeLayoutPlanSchema(runtimeRoot);
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.schemaVersion).toEqual({ const: FREEFORM_CANONICAL_SCHEMA_VERSION });
    expect(
      sha256File(
        path.join(
          runtimeRoot,
          "packages/renderer-contract/schema/creative-layout-plan-v1.schema.json",
        ),
      ),
    ).toBe(FREEFORM_CANONICAL_SCHEMA_SHA256);
    expect(sha256File(path.join(runtimeRoot, "contracts/freeform-format-profiles.json"))).toBe(
      FREEFORM_FORMAT_PROFILE_REGISTRY_SHA256,
    );
    expect(sha256File(path.join(runtimeRoot, "contracts/freeform-font-registry.json"))).toBe(
      FREEFORM_FONT_REGISTRY_SHA256,
    );
    expect(profileRegistry.registryVersion).toBe("1.4.0");
    expect(fontRegistry.fallbackAllowed).toBe(false);
  });

  it("freezes target registry facts, safe-zone authority, and PNG mapping", () => {
    expect(targetProfile).toMatchObject({
      formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
      channelNamespace: "KAKAO_MOMENT",
      canvas: { width: 1200, height: 600 },
      layoutMode: "FREEFORM",
      officialSizeRule: "MINIMUM_WITH_RATIO",
      officialRatio: "2:1",
      allowedOutputFormats: ["PNG", "JPEG"],
      outputConstraints: {
        maximumBytes: 500000,
        maximumBytesComparator: "LTE",
        requiresOpaqueOutput: true,
      },
      elementConstraints: { allowImage: true, allowText: true, allowLogo: true, allowShape: false },
      safeZonePolicy: {
        avoid: { top: 40, left: 40, right: 40, bottom: 90 },
        managedElementSeverity: "WARNING",
      },
    });
    expect(FREEFORM_PLUME_FORMAT_PROFILE_ID).toBe("kakao-moment-display-native-2-1-1200x600");
    expect(KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING).toEqual({
      plumeFormatProfileId: FREEFORM_PLUME_FORMAT_PROFILE_ID,
      rendererFormatProfileId: FREEFORM_RENDERER_FORMAT_PROFILE_ID,
      rendererTemplateId: null,
      layoutMode: "FREEFORM",
    });
    expect(FREEFORM_OUTPUT_MAPPING).toEqual({ mimeType: "image/png", format: "PNG" });
  });

  it("accepts the canonical three-element first-proof plan", () => {
    const candidate = plan();
    expect(validateFreeformLayoutContract(candidate, expectation)).toEqual([]);
    expect(assertFreeformLayoutContract(candidate, expectation)).toBe(candidate);
  });

  it.each([
    [
      "wrong format",
      { formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1_WRONG" },
      "KBR-FREEFORM-FORMAT-PROFILE-MISMATCH",
    ],
    ["wrong source", { source: "MANUAL" }, "FREEFORM_PLAN_SOURCE_INVALID"],
    [
      "transparent background",
      { background: { type: "TRANSPARENT" } },
      "FREEFORM_TRANSPARENT_BACKGROUND_UNSUPPORTED",
    ],
    [
      "wrong copy",
      {
        elements: plan().elements.map((element) =>
          element.id === "headline" ? { ...element, text: "변경된 문구" } : element,
        ),
      },
      "FREEFORM_HEADLINE_COPY_MISMATCH",
    ],
    [
      "wrong asset",
      {
        elements: plan().elements.map((element) =>
          element.type === "IMAGE" ? { ...element, assetId: "asset-other" } : element,
        ),
      },
      "FREEFORM_ASSET_ID_MISMATCH",
    ],
    [
      "extra shape",
      {
        elements: [
          ...plan().elements,
          {
            ...plan().elements[0],
            id: "shape",
            type: "SHAPE",
            shape: "RECTANGLE",
            fillColor: "#FFFFFF",
          },
        ],
      },
      "KBR-FREEFORM-PLAN-SCHEMA-INVALID",
    ],
  ] as const)("rejects %s", (_name, overrides, code) => {
    const issues = validateFreeformLayoutContract(plan(overrides), expectation);
    expect(issues.some((candidate) => candidate.code === code)).toBe(true);
  });

  it("rejects multiple images and logos while retaining Renderer validation authority", () => {
    const candidate = plan({
      elements: [
        ...plan().elements,
        {
          ...plan().elements[0],
          id: "image-secondary",
          assetId: "asset-secondary",
          bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        },
      ],
    });
    expect(
      validateFreeformLayoutContract(candidate, expectation).some(
        (issue) => issue.code === "FREEFORM_FIRST_PROOF_IMAGE_COUNT_INVALID",
      ),
    ).toBe(true);
    const withLogo = plan({
      elements: [
        plan().elements[0],
        plan().elements[1],
        plan().elements[2],
        { ...plan().elements[0], id: "logo", type: "LOGO", assetId: "logo" },
      ],
    });
    expect(
      validateFreeformLayoutContract(withLogo, expectation).some(
        (issue) => issue.code === "FREEFORM_LOGO_DEFERRED",
      ),
    ).toBe(true);
  });

  it("round-trips evidence and rejects plan, hash, or profile tampering", () => {
    const candidate = plan();
    const evidence = createFreeformLayoutEvidence(candidate, expectation);
    expect(Object.keys(evidence)).toEqual([FREEFORM_LAYOUT_EVIDENCE_METADATA_KEY]);
    expect(evidence.freeformLayoutEvidence.schemaVersion).toBe(
      FREEFORM_LAYOUT_EVIDENCE_SCHEMA_VERSION,
    );
    expect(evidence.freeformLayoutEvidence.creativeLayoutPlanSha256).toBe(
      freeformLayoutPlanSha256(candidate),
    );
    expect(validateFreeformLayoutEvidence(evidence, expectation)).toEqual(evidence);
    const tampered = {
      ...evidence,
      freeformLayoutEvidence: {
        ...evidence.freeformLayoutEvidence,
        creativeLayoutPlan: {
          ...candidate,
          elements: candidate.elements.map((element) =>
            element.id === "headline" ? { ...element, text: "tampered" } : element,
          ),
        },
      },
    };
    expect(() => validateFreeformLayoutEvidence(tampered, expectation)).toThrow(
      "FREEFORM_LAYOUT_EVIDENCE_HASH_MISMATCH",
    );
    const profileTampered = {
      ...evidence,
      freeformLayoutEvidence: {
        ...evidence.freeformLayoutEvidence,
        rendererFormatProfileId: "WRONG",
      },
    };
    expect(() => validateFreeformLayoutEvidence(profileTampered, expectation)).toThrow(
      "FREEFORM_LAYOUT_EVIDENCE_IDENTITY_INVALID",
    );
  });

  it("activates the FREEFORM binding for PI-3C", () => {
    expect(
      resolveCanonicalRendererBinding(PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID),
    ).toEqual(KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING);
  });
});
