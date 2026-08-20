import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRendererRuntimeRoot,
  INTEGRATION_SCHEMA_VERSION,
  OBJECT_RIGHT_FORMAT_PROFILE_ID,
  OBJECT_RIGHT_IMAGE_SLOT_ID,
  OBJECT_RIGHT_TEMPLATE_ID,
  type AppliedImagePlacement,
  type LayoutMeasurements,
  type LegacyObjectRightInput,
} from "@plume/renderer-vendor";
import { describe, expect, it, vi } from "vitest";
import { createCanonicalRendererAdapter } from "./canonical-renderer-adapter.js";
import { createObjectRightFileBridge } from "./canonical-renderer-file-bridge.js";
import { buildObjectRightIntegrationInput } from "./object-right-input-builder.js";
import {
  createPlumeRendererAssetResolver,
  type RendererAssetByteStore,
  type RendererAssetTokenBinding,
} from "./renderer-asset-resolver.js";
import {
  OBJECT_RIGHT_FORMAT_BINDING,
  PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,
  resolveCanonicalRendererBinding,
} from "./renderer-bindings.js";
import * as legacyRenderer from "./renderer-adapter.js";

const WORKSPACE_ID = "workspace-1";
const TOKEN = "asset-token-product-basic";
const FILE_OBJECT_ID = "file-object-product-basic";
const OBJECT_KEY = `workspaces/${WORKSPACE_ID}/files/product-basic.png`;
const EXPECTED_WINDOWS_CHECKSUM =
  "20dc9d62b8650a72115a8d584846399d9cd6dd2c8a0996b4889edb596feb68b1";
const EXPECTED_WINDOWS_REQUEST_FINGERPRINT =
  "5fb59fcf056c56491018f78d6b96ed82fb8409608b432fbde9c08dde211946cb";
const EXPECTED_WINDOWS_PIXEL_FINGERPRINT =
  "f6690a069d861caeb90770d3f8e9304c7bba749177eda83c4222668e6f066836";

class MemoryRendererStorage implements RendererAssetByteStore {
  public readonly calls: string[] = [];

  public constructor(private readonly objects: ReadonlyMap<string, Uint8Array>) {}

  public async get(objectKey: string): Promise<Uint8Array> {
    this.calls.push(objectKey);
    const bytes = this.objects.get(objectKey);
    if (!bytes) throw new Error("TEST_STORAGE_OBJECT_NOT_FOUND");
    return bytes.slice();
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixturePath(...segments: string[]): string {
  return path.join(getRendererRuntimeRoot(), ...segments);
}

interface HarnessOptions {
  readonly bytes: Uint8Array;
  readonly requestMimeType?: "image/png" | "image/jpeg";
  readonly resolvedMimeType?: "image/png" | "image/jpeg";
  readonly checksumSha256?: string;
  readonly token?: string;
  readonly bindingWorkspaceId?: string;
  readonly declaredWidth?: number;
  readonly declaredHeight?: number;
  readonly onAuthoritativeMeasurements?: (measurements: LayoutMeasurements) => void;
}

function createHarness(options: HarnessOptions) {
  const storage = new MemoryRendererStorage(new Map([[OBJECT_KEY, options.bytes]]));
  const binding: RendererAssetTokenBinding = {
    token: TOKEN,
    workspaceId: options.bindingWorkspaceId ?? WORKSPACE_ID,
    fileObjectId: FILE_OBJECT_ID,
    objectKey: OBJECT_KEY,
    mimeType: options.resolvedMimeType ?? "image/png",
  };
  const resolver = createPlumeRendererAssetResolver({
    workspaceId: WORKSPACE_ID,
    storage,
    bindings: [binding],
  });
  const ephemeralWorkspaces: string[] = [];
  const adapter = createCanonicalRendererAdapter({
    workspaceId: WORKSPACE_ID,
    assetResolver: resolver,
    onEphemeralWorkspaceCreated: (workspacePath) => ephemeralWorkspaces.push(workspacePath),
    onAuthoritativeMeasurements: options.onAuthoritativeMeasurements,
  });
  return {
    adapter,
    resolver,
    storage,
    ephemeralWorkspaces,
    request: {
      requestId: "canonical-render-request-1",
      workspaceId: WORKSPACE_ID,
      plumeFormatProfileId: PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,
      advertiser: "자코모",
      headline: "자코모 프리미엄 소파",
      subcopy: "거실을 바꾸는 선택",
      productAsset: {
        token: options.token ?? TOKEN,
        mimeType: options.requestMimeType ?? "image/png",
        checksumSha256: options.checksumSha256 ?? sha256(options.bytes),
        ...(options.declaredWidth === undefined ? {} : { declaredWidth: options.declaredWidth }),
        ...(options.declaredHeight === undefined ? {} : { declaredHeight: options.declaredHeight }),
      },
    },
  };
}

function integrationErrorCodes(
  result: Awaited<ReturnType<ReturnType<typeof createHarness>["adapter"]["render"]>>,
): string[] {
  return (
    result.renderMetadata.rendererIntegrationOutput?.validation.errors.map(({ code }) => code) ?? []
  );
}

function expectPlacementMatchesMeasurements(
  placement: AppliedImagePlacement,
  measurements: LayoutMeasurements,
): void {
  expect(placement.destinationRect).toEqual({
    x: measurements.productPlacedBox.x,
    y: measurements.productPlacedBox.y,
    width: measurements.productPlacedBox.width,
    height: measurements.productPlacedBox.height,
  });
  expect(placement.appliedScale).toBe(measurements.objectScale);
  expect(placement.alphaTrimApplied).toBe(true);
  expect(placement.resolvedSourceCropPixels).toEqual(measurements.alphaTrimBox);
}

describe("canonical Object Right binding and input", () => {
  it("pins contract 1.8.0 and maps the Plume format without inference or agent placement", () => {
    expect(INTEGRATION_SCHEMA_VERSION).toBe("1.8.0");
    expect(resolveCanonicalRendererBinding(PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID)).toEqual({
      plumeFormatProfileId: "kakao-moment-bizboard-1029x258",
      rendererFormatProfileId: "KAKAO_BIZBOARD_OBJECT_RIGHT",
      rendererTemplateId: "KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1",
      layoutMode: "TEMPLATE_LOCKED",
    });
    expect(() => resolveCanonicalRendererBinding("unknown-format")).toThrowError(
      expect.objectContaining({ code: "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND" }),
    );
    const input = buildObjectRightIntegrationInput(OBJECT_RIGHT_FORMAT_BINDING, {
      advertiser: "자코모",
      headline: "자코모 프리미엄 소파",
      subcopy: "거실을 바꾸는 선택",
      productAsset: {
        token: TOKEN,
        mimeType: "image/png",
        checksumSha256: "a".repeat(64),
      },
    });
    expect(input).toMatchObject({
      schemaVersion: "1.8.0",
      formatProfileId: OBJECT_RIGHT_FORMAT_PROFILE_ID,
      templateId: OBJECT_RIGHT_TEMPLATE_ID,
      layoutMode: "TEMPLATE_LOCKED",
      assets: [{ assetRef: { type: "INTEGRATION_ASSET_TOKEN", value: TOKEN } }],
      imagePlacementPlans: [
        {
          schemaVersion: "1.8.0",
          imageSlotId: OBJECT_RIGHT_IMAGE_SLOT_ID,
          policy: "ALPHA_TRIM_CONTAIN",
          source: "DETERMINISTIC",
          fitMode: "CONTAIN",
          anchor: "CENTER",
          subjectProtection: "NONE",
        },
      ],
      output: { mimeType: "image/png" },
    });
    expect(input.imagePlacementPlans[0]).not.toHaveProperty("cropRect");
    expect(input.imagePlacementPlans[0]).not.toHaveProperty("rationale");
  });
});

describe("Plume Renderer asset resolver", () => {
  it("resolves only an authorized opaque token inside the configured workspace", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const harness = createHarness({ bytes });
    await expect(
      harness.resolver.resolve({ type: "INTEGRATION_ASSET_TOKEN", value: TOKEN }),
    ).resolves.toEqual({ bytes, resolvedMimeType: "image/png" });
    expect(harness.storage.calls).toEqual([OBJECT_KEY]);
    await expect(
      harness.resolver.resolve({ type: "INTEGRATION_ASSET_TOKEN", value: "unknown-token" }),
    ).rejects.toMatchObject({ code: "RENDERER_ASSET_TOKEN_UNKNOWN" });
    const crossWorkspace = createHarness({ bytes, bindingWorkspaceId: "workspace-2" });
    await expect(
      crossWorkspace.resolver.resolve({ type: "INTEGRATION_ASSET_TOKEN", value: TOKEN }),
    ).rejects.toMatchObject({ code: "RENDERER_ASSET_WORKSPACE_SCOPE_MISMATCH" });
    expect(crossWorkspace.storage.calls).toEqual([]);
  });
});

describe("Plume canonical Renderer adapter", () => {
  it("renders the approved actual PNG byte-for-byte and replays deterministically", async () => {
    const [actualAsset, expectedOutput] = await Promise.all([
      readFile(fixturePath("fixtures", "valid", "object-right__product__basic__pass.png")),
      readFile(fixturePath("fixtures", "golden", "object-right__stable__golden.png")),
    ]);
    expect(sha256(actualAsset)).toBe(
      "fd5d6e48ebbf443f10f40af1b70091649b208bc7118f64dc3a990434915fc2fe",
    );
    const authoritativeMeasurements: LayoutMeasurements[] = [];
    const harness = createHarness({
      bytes: actualAsset,
      declaredWidth: 260,
      declaredHeight: 160,
      onAuthoritativeMeasurements: (measurements) => authoritativeMeasurements.push(measurements),
    });
    const legacySpy = vi.spyOn(legacyRenderer, "renderCreativeDocument");
    const first = await harness.adapter.render(harness.request);
    const second = await harness.adapter.render({
      ...harness.request,
      requestId: "canonical-render-request-2",
    });
    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    if (first.status !== "COMPLETED" || second.status !== "COMPLETED") return;

    expect(first.outputBytes).toEqual(second.outputBytes);
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.width).toBe(1029);
    expect(first.height).toBe(258);
    expect(first.outputBytes[24]).toBe(8);
    expect(first.outputBytes[25]).toBe(6);
    expect(first.renderMetadata.legacyFallbackUsed).toBe(false);
    expect(legacySpy).not.toHaveBeenCalled();

    const firstOutput = first.renderMetadata.rendererIntegrationOutput;
    const secondOutput = second.renderMetadata.rendererIntegrationOutput;
    expect(firstOutput).toMatchObject({
      schemaVersion: "1.8.0",
      status: "PASS",
      artifact: { mimeType: "image/png", width: 1029, height: 258 },
      appliedImagePlacements: [
        {
          imageSlotId: OBJECT_RIGHT_IMAGE_SLOT_ID,
          changedFromRequestedPlan: false,
        },
      ],
    });
    expect(firstOutput?.requestFingerprint).toHaveLength(64);
    expect(firstOutput?.pixelFingerprint).toHaveLength(64);
    expect(firstOutput?.renderFingerprint).toHaveLength(64);
    expect(firstOutput?.requestFingerprint).toBe(secondOutput?.requestFingerprint);
    expect(firstOutput?.pixelFingerprint).toBe(secondOutput?.pixelFingerprint);
    expect(firstOutput?.renderFingerprint).toBe(secondOutput?.renderFingerprint);
    expect(firstOutput?.validation.info.map(({ code }) => code)).toContain("KBR-OUTPUT-010");
    expect(authoritativeMeasurements).toHaveLength(2);
    const firstPlacement = firstOutput?.appliedImagePlacements[0];
    const secondPlacement = secondOutput?.appliedImagePlacements[0];
    expect(firstPlacement).toBeDefined();
    expect(secondPlacement).toBeDefined();
    if (
      !firstPlacement ||
      !secondPlacement ||
      !authoritativeMeasurements[0] ||
      !authoritativeMeasurements[1]
    )
      return;
    expectPlacementMatchesMeasurements(firstPlacement, authoritativeMeasurements[0]);
    expectPlacementMatchesMeasurements(secondPlacement, authoritativeMeasurements[1]);

    if (process.platform === "win32" && process.arch === "x64") {
      expect(first.outputBytes).toEqual(new Uint8Array(expectedOutput));
      expect(first.checksumSha256).toBe(EXPECTED_WINDOWS_CHECKSUM);
      expect(firstOutput?.requestFingerprint).toBe(EXPECTED_WINDOWS_REQUEST_FINGERPRINT);
      expect(firstOutput?.pixelFingerprint).toBe(EXPECTED_WINDOWS_PIXEL_FINGERPRINT);
      expect(firstOutput?.renderFingerprint).toBe(EXPECTED_WINDOWS_PIXEL_FINGERPRINT);
    }
    expect(new Set(harness.ephemeralWorkspaces).size).toBe(2);
    for (const workspacePath of harness.ephemeralWorkspaces)
      await expect(access(workspacePath)).rejects.toMatchObject({ code: "ENOENT" });
    legacySpy.mockRestore();
  });

  it("uses varying authoritative geometry for a second aspect-ratio asset", async () => {
    const [assetA, assetB] = await Promise.all([
      readFile(fixturePath("fixtures", "valid", "object-right__product__basic__pass.png")),
      readFile(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "__fixtures__",
          "object-right-product-tall.png",
        ),
      ),
    ]);
    const authoritativeA: LayoutMeasurements[] = [];
    const authoritativeB: LayoutMeasurements[] = [];
    const harnessA = createHarness({
      bytes: assetA,
      declaredWidth: 260,
      declaredHeight: 160,
      onAuthoritativeMeasurements: (measurements) => authoritativeA.push(measurements),
    });
    const harnessB = createHarness({
      bytes: assetB,
      onAuthoritativeMeasurements: (measurements) => authoritativeB.push(measurements),
    });
    const [resultA, resultB] = await Promise.all([
      harnessA.adapter.render(harnessA.request),
      harnessB.adapter.render(harnessB.request),
    ]);
    expect(resultA.status).toBe("COMPLETED");
    expect(resultB.status).toBe("COMPLETED");
    expect(authoritativeA).toHaveLength(1);
    expect(authoritativeB).toHaveLength(1);
    if (
      resultA.status !== "COMPLETED" ||
      resultB.status !== "COMPLETED" ||
      !authoritativeA[0] ||
      !authoritativeB[0]
    )
      return;
    const placementA = resultA.renderMetadata.rendererIntegrationOutput?.appliedImagePlacements[0];
    const placementB = resultB.renderMetadata.rendererIntegrationOutput?.appliedImagePlacements[0];
    expect(placementA).toBeDefined();
    expect(placementB).toBeDefined();
    if (!placementA || !placementB) return;
    expectPlacementMatchesMeasurements(placementA, authoritativeA[0]);
    expectPlacementMatchesMeasurements(placementB, authoritativeB[0]);
    expect(placementA.destinationRect).not.toEqual(placementB.destinationRect);
    expect(placementA.appliedScale).not.toBe(placementB.appliedScale);
    expect(placementA.resolvedSourceCropPixels).not.toEqual(placementB.resolvedSourceCropPixels);
  });

  it("fails closed for checksum mismatch without invoking the frozen Core", async () => {
    const actualAsset = await readFile(
      fixturePath("fixtures", "valid", "object-right__product__basic__pass.png"),
    );
    const harness = createHarness({ bytes: actualAsset, checksumSha256: "0".repeat(64) });
    const result = await harness.adapter.render(harness.request);
    expect(result.status).toBe("FAILED");
    expect(integrationErrorCodes(result)).toContain("KBR-ASSET-CHECKSUM-MISMATCH");
    expect(harness.ephemeralWorkspaces).toEqual([]);
  });

  it("blocks JPEG magic bytes declared as PNG", async () => {
    const jpeg = await readFile(
      fixturePath("fixtures", "valid", "thumbnail-box-right__asset__jpeg__pass.jpg"),
    );
    const harness = createHarness({
      bytes: jpeg,
      requestMimeType: "image/png",
      resolvedMimeType: "image/jpeg",
    });
    const result = await harness.adapter.render(harness.request);
    expect(result.status).toBe("FAILED");
    expect(integrationErrorCodes(result)).toEqual(
      expect.arrayContaining(["KBR-ASSET-MIME-NOT-ALLOWED", "KBR-ASSET-MIME-EXTENSION-MISMATCH"]),
    );
    expect(harness.ephemeralWorkspaces).toEqual([]);
  });

  it("blocks a valid PNG that has no alpha channel", async () => {
    const rgbPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=",
      "base64",
    );
    expect(rgbPng[25]).toBe(2);
    const harness = createHarness({ bytes: rgbPng });
    const result = await harness.adapter.render(harness.request);
    expect(result.status).toBe("FAILED");
    expect(integrationErrorCodes(result)).toContain("KBR-ALPHA-CHANNEL-REQUIRED");
    expect(harness.ephemeralWorkspaces).toEqual([]);
  });

  it("blocks an unknown asset token and an unknown format without fallback", async () => {
    const actualAsset = await readFile(
      fixturePath("fixtures", "valid", "object-right__product__basic__pass.png"),
    );
    const unknownToken = createHarness({ bytes: actualAsset, token: "unknown-token" });
    const tokenResult = await unknownToken.adapter.render(unknownToken.request);
    expect(tokenResult.status).toBe("FAILED");
    expect(integrationErrorCodes(tokenResult)).toContain("KBR-ASSET-REF-UNRESOLVED");
    expect(unknownToken.ephemeralWorkspaces).toEqual([]);

    const unknownFormat = createHarness({ bytes: actualAsset });
    const formatResult = await unknownFormat.adapter.render({
      ...unknownFormat.request,
      plumeFormatProfileId: "unknown-format",
    });
    expect(formatResult).toMatchObject({
      status: "FAILED",
      error: { code: "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND" },
      renderMetadata: { legacyFallbackUsed: false },
    });
    expect(unknownFormat.storage.calls).toEqual([]);
    expect(unknownFormat.ephemeralWorkspaces).toEqual([]);
  });

  it("rejects traversal and cleans the isolated workspace on bridge failure", async () => {
    const actualAsset = await readFile(
      fixturePath("fixtures", "valid", "object-right__product__basic__pass.png"),
    );
    const workspaces: string[] = [];
    const bridge = createObjectRightFileBridge({
      onEphemeralWorkspaceCreated: (workspacePath) => workspaces.push(workspacePath),
    });
    const unsafeInput: LegacyObjectRightInput = {
      channel: "KAKAO_MOMENT",
      placement: "BIZBOARD",
      template: "OBJECT_RIGHT",
      advertiser: "자코모",
      copy: { headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" },
      cta: { mode: "NONE", label: "" },
      product: { relativePath: "../escape.png", expectedSha256: sha256(actualAsset) },
      output: { directory: "integration-output", baseName: "output", overwrite: false },
      canvas: { width: 1029, height: 258 },
    };
    await expect(
      bridge(unsafeInput, { bytes: actualAsset, resolvedMimeType: "image/png" }),
    ).rejects.toThrow("RENDERER_EPHEMERAL_PATH_INVALID");
    expect(workspaces).toHaveLength(1);
    const workspacePath = workspaces[0];
    expect(workspacePath).toBeDefined();
    if (workspacePath)
      await expect(access(workspacePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
