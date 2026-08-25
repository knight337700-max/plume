import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRendererRuntimeRoot,
  type CreativeLayoutPlan,
  type FreeformRenderResult,
} from "@plume/renderer-vendor";
import { createCanonicalRendererAdapter } from "./canonical-renderer-adapter.js";
import type { CanonicalRendererRequest } from "./canonical-renderer-port.js";
import type { CanonicalFreeformRendererBridge } from "./canonical-renderer-freeform-bridge.js";
import {
  createPlumeRendererAssetResolver,
  type RendererAssetByteStore,
  type RendererAssetTokenBinding,
} from "./renderer-asset-resolver.js";
import { PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID } from "./renderer-bindings.js";

const WORKSPACE_ID = "pi-3c-workspace";
const TOKEN = "pi-3c-asset-token";
const FILE_OBJECT_ID = "pi-3c-file-object";
const OBJECT_KEY = `workspaces/${WORKSPACE_ID}/files/asset.png`;

class MemoryRendererStorage implements RendererAssetByteStore {
  public constructor(private readonly bytes: Uint8Array) {}

  public async get(objectKey: string): Promise<Uint8Array> {
    if (objectKey !== OBJECT_KEY) throw new Error("TEST_STORAGE_OBJECT_NOT_FOUND");
    return this.bytes.slice();
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function firstProofPlan(): CreativeLayoutPlan {
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
        assetId: "asset-primary",
      },
      {
        id: "headline",
        type: "TEXT",
        bounds: { x: 0.06, y: 0.16, width: 0.42, height: 0.2 },
        zIndex: 1,
        role: "HEADLINE",
        text: "자코모 프리미엄 소파",
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
        text: "거실을 바꾸는 선택",
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

async function harness() {
  const bytes = new Uint8Array(
    await readFile(
      path.join(
        getRendererRuntimeRoot(),
        "fixtures",
        "valid",
        "thumbnail-box-right__asset__basic__pass.png",
      ),
    ),
  );
  const binding: RendererAssetTokenBinding = {
    token: TOKEN,
    workspaceId: WORKSPACE_ID,
    fileObjectId: FILE_OBJECT_ID,
    objectKey: OBJECT_KEY,
    mimeType: "image/png",
  };
  const resolver = createPlumeRendererAssetResolver({
    workspaceId: WORKSPACE_ID,
    storage: new MemoryRendererStorage(bytes),
    bindings: [binding],
  });
  const ephemeralWorkspaces: string[] = [];
  const adapter = createCanonicalRendererAdapter({
    workspaceId: WORKSPACE_ID,
    assetResolver: resolver,
    onEphemeralWorkspaceCreated: (workspacePath) => ephemeralWorkspaces.push(workspacePath),
  });
  return {
    adapter,
    bytes,
    ephemeralWorkspaces,
    request: {
      requestId: "pi-3c-render-request-1",
      workspaceId: WORKSPACE_ID,
      plumeFormatProfileId: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
      layoutMode: "FREEFORM" as const,
      creativeLayoutPlan: firstProofPlan(),
      assets: [
        {
          assetId: "asset-primary",
          token: TOKEN,
          mimeType: "image/png" as const,
          checksumSha256: sha256(bytes),
        },
      ],
      output: { mimeType: "image/png" as const, format: "PNG" as const },
    },
  };
}

describe("PI-3C deterministic FREEFORM Renderer integration", () => {
  it("dispatches through the frozen renderer and replays byte-identically", async () => {
    const fixture = await harness();
    const first = await fixture.adapter.render(fixture.request);
    const second = await fixture.adapter.render({
      ...fixture.request,
      requestId: "pi-3c-render-request-2",
    });
    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    if (first.status !== "COMPLETED" || second.status !== "COMPLETED") return;
    expect(first.width).toBe(1200);
    expect(first.height).toBe(600);
    expect(first.outputBytes).toEqual(second.outputBytes);
    expect(first.checksumSha256).toBe(sha256(first.outputBytes));
    expect(first.checksumSha256).toBe(second.checksumSha256);
    expect(first.bytes).toBe(first.outputBytes.byteLength);
    expect(first.renderMetadata).toMatchObject({
      rendererIntegrationContract: "1.8.0",
      rendererCommit: "7baa272dd852ed21a09cf369c928571b3f75fd31",
      legacyFallbackUsed: false,
      formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
      artifactFormat: "PNG",
    });
    expect(first.renderMetadata.requestFingerprint).toBe(second.renderMetadata.requestFingerprint);
    expect(first.renderMetadata.pixelFingerprint).toBe(second.renderMetadata.pixelFingerprint);
    expect(first.renderMetadata.renderFingerprint).toBe(second.renderMetadata.renderFingerprint);
    expect(first.renderMetadata.renderFingerprint).toBe(first.renderMetadata.pixelFingerprint);
    expect(first.renderMetadata.artifactChecksumSha256).toBe(first.checksumSha256);
    expect(first.renderMetadata.rendererWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "KBR-FREEFORM-MANUAL-REVIEW-REQUIRED" }),
      ]),
    );
    expect(fixture.ephemeralWorkspaces).toHaveLength(2);
    for (const workspacePath of fixture.ephemeralWorkspaces)
      await expect(access(workspacePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a FREEFORM request when the declared asset checksum drifts", async () => {
    const fixture = await harness();
    const result = await fixture.adapter.render({
      ...fixture.request,
      assets: [{ ...fixture.request.assets[0]!, checksumSha256: "0".repeat(64) }],
    });
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatchObject({ code: "CANONICAL_FREEFORM_ASSET_IDENTITY_MISMATCH" });
    expect(fixture.ephemeralWorkspaces).toEqual([]);
  });

  it("rejects a template-shaped request for the FREEFORM binding before asset resolution", async () => {
    const fixture = await harness();
    const templateShaped = { ...fixture.request } as unknown as Record<string, unknown>;
    delete templateShaped.layoutMode;
    delete templateShaped.creativeLayoutPlan;
    delete templateShaped.assets;
    delete templateShaped.output;
    const result = await fixture.adapter.render(
      templateShaped as unknown as CanonicalRendererRequest,
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatchObject({ code: "CANONICAL_RENDERER_LAYOUT_MODE_MISMATCH" });
    expect(fixture.ephemeralWorkspaces).toEqual([]);
  });

  it("propagates a frozen FREEFORM BLOCKED result without fallback", async () => {
    const fixture = await harness();
    const blocked: FreeformRenderResult = {
      status: "BLOCKED",
      png: null,
      pngDigest: null,
      manifestDigest: null,
      manifestPath: null,
      pngPath: null,
      downloadAllowed: false,
      formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
      artifactChecksumSha256: null,
      pixelFingerprint: null,
      requestFingerprint: null,
      renderFingerprint: null,
      artifactFormat: null,
      artifactDigest: null,
      artifactPath: null,
      outputEncoding: null,
      appliedElements: [],
      errors: [
        {
          code: "KBR-FREEFORM-PLAN-MISSING",
          severity: "ERROR",
          messageKey: "freeform.plan_missing",
          path: "/creativeLayoutPlan",
        },
      ],
      warnings: [],
      manifest: null,
    };
    const bridge: CanonicalFreeformRendererBridge = async () => blocked;
    const resolverAdapter = createCanonicalRendererAdapter({
      workspaceId: WORKSPACE_ID,
      assetResolver: createPlumeRendererAssetResolver({
        workspaceId: WORKSPACE_ID,
        storage: new MemoryRendererStorage(fixture.bytes),
        bindings: [
          {
            token: TOKEN,
            workspaceId: WORKSPACE_ID,
            fileObjectId: FILE_OBJECT_ID,
            objectKey: OBJECT_KEY,
            mimeType: "image/png",
          },
        ],
      }),
      freeformBridge: bridge,
    });
    const result = await resolverAdapter.render(fixture.request);
    expect(result.status).toBe("FAILED");
    expect(result.error).toMatchObject({ code: "CANONICAL_FREEFORM_RENDERER_BLOCKED" });
    expect(result.renderMetadata.rendererWarnings).toEqual([]);
    expect(result.renderMetadata.legacyFallbackUsed).toBe(false);
  });
});
