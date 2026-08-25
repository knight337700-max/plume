import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCanonicalRendererAdapter } from "../../../../packages/infrastructure/src/render/canonical-renderer-adapter.js";
import type { CanonicalRendererFreeformRequest } from "../../../../packages/infrastructure/src/render/canonical-renderer-port.js";
import {
  createPlumeRendererAssetResolver,
  type RendererAssetByteStore,
} from "../../../../packages/infrastructure/src/render/renderer-asset-resolver.js";
import { PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID } from "../../../../packages/infrastructure/src/render/renderer-bindings.js";
import { createInMemoryExportRepositories } from "../../../../packages/core/src/modules/export/repositories.js";
import { createInMemoryValidationRepositories } from "../../../../packages/core/src/modules/validation/repositories.js";
import { createExportWorkerHandler } from "./export/build-export.js";
import { createValidationWorkerHandler } from "./validation/run-validation.js";

const WORKSPACE_ID = "pi-3c-worker-workspace";
const TOKEN = "pi-3c-worker-token";
const OBJECT_KEY = `workspaces/${WORKSPACE_ID}/files/asset.png`;
const CREATIVE_VERSION_ID = "pi-3c-creative-version";
type CreativeLayoutPlan = CanonicalRendererFreeformRequest["creativeLayoutPlan"];

class MemoryStorage implements RendererAssetByteStore {
  public constructor(private readonly bytes: Uint8Array) {}

  public async get(objectKey: string): Promise<Uint8Array> {
    if (objectKey !== OBJECT_KEY) throw new Error("TEST_STORAGE_OBJECT_NOT_FOUND");
    return this.bytes.slice();
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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

const creativeDocument = {
  schemaVersion: "1.0.0" as const,
  formatProfileId: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
  canvas: { width: 1200, height: 600, colorMode: "RGB" as const, transparentBackground: false },
  elements: [
    {
      id: "image-primary",
      type: "IMAGE" as const,
      x: 660,
      y: 48,
      width: 480,
      height: 504,
      zIndex: 0,
      locked: false,
      visible: true,
      assetVersionId: "asset-version-1",
    },
    {
      id: "headline",
      type: "TEXT" as const,
      x: 72,
      y: 96,
      width: 504,
      height: 120,
      zIndex: 1,
      locked: false,
      visible: true,
      text: "자코모 프리미엄 소파",
    },
    {
      id: "subcopy",
      type: "TEXT" as const,
      x: 72,
      y: 252,
      width: 504,
      height: 96,
      zIndex: 2,
      locked: false,
      visible: true,
      text: "거실을 바꾸는 선택",
    },
  ],
  usedAssetVersionIds: ["asset-version-1"],
  copyAssets: {
    advertiser: "자코모",
    headline: "자코모 프리미엄 소파",
    subcopy: "거실을 바꾸는 선택",
  },
  metadata: {
    workspaceId: WORKSPACE_ID,
    campaignId: "campaign-1",
    creativeId: "creative-1",
    productId: "product-1",
  },
};

describe("PI-3C FREEFORM render → validation → export worker path", () => {
  it("uses one rendered artifact for validation and export without a third render", async () => {
    const bytes = new Uint8Array(
      await readFile(
        path.join(
          process.cwd(),
          "packages",
          "renderer-vendor",
          "upstream",
          "fixtures",
          "valid",
          "thumbnail-box-right__asset__basic__pass.png",
        ),
      ),
    );
    const checksum = sha256(bytes);
    const resolver = createPlumeRendererAssetResolver({
      workspaceId: WORKSPACE_ID,
      storage: new MemoryStorage(bytes),
      bindings: [
        {
          token: TOKEN,
          workspaceId: WORKSPACE_ID,
          fileObjectId: "file-object-1",
          objectKey: OBJECT_KEY,
          mimeType: "image/png",
        },
      ],
    });
    const renderer = createCanonicalRendererAdapter({
      workspaceId: WORKSPACE_ID,
      assetResolver: resolver,
    });
    const rendered = await renderer.render({
      requestId: "pi-3c-worker-render",
      workspaceId: WORKSPACE_ID,
      plumeFormatProfileId: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
      layoutMode: "FREEFORM",
      creativeLayoutPlan: plan(),
      assets: [
        { assetId: "asset-primary", token: TOKEN, mimeType: "image/png", checksumSha256: checksum },
      ],
      output: { mimeType: "image/png", format: "PNG" },
    });
    expect(rendered.status).toBe("COMPLETED");
    if (rendered.status !== "COMPLETED") return;

    const validationRepositories = createInMemoryValidationRepositories();
    const validation = createValidationWorkerHandler({ repositories: validationRepositories });
    const validationResult = await validation.handle({
      workspaceId: WORKSPACE_ID,
      validationRunId: "pi-3c-validation-run",
      creativeVersionId: CREATIVE_VERSION_ID,
      creativeDocument,
      formatSnapshot: {
        id: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
        width: 1200,
        height: 600,
        status: "ACTIVE",
      },
      ruleSnapshot: { sourceVersion: "kakao-moment-2026.1", rules: [] },
      aiFindings: [],
      file: {
        mimeType: "image/png",
        magicMimeType: "image/png",
        width: rendered.width,
        height: rendered.height,
        bytes: rendered.bytes,
        alpha: false,
        colorMode: "RGBA",
      },
    });
    expect(validationResult.status).toBe("PASS");
    expect(validationResult.summary).toMatchObject({ errorCount: 0, warningCount: 0 });

    const exportRepositories = createInMemoryExportRepositories();
    const job = await exportRepositories.createJob({
      id: "pi-3c-export-job",
      workspaceId: WORKSPACE_ID,
      campaignId: "campaign-1",
      exportRecipeId: "kakao-moment-display-native",
      requestedBy: "pi-3c-test",
    });
    const item = await exportRepositories.createItem({
      id: "pi-3c-export-item",
      workspaceId: WORKSPACE_ID,
      exportJobId: job.id,
      creativeVersionId: CREATIVE_VERSION_ID,
      approvalRequestId: "approval-1",
      validationRunId: validationResult.run.id,
      sortOrder: 1,
    });
    const exportWorker = createExportWorkerHandler({ repositories: exportRepositories });
    const exported = await exportWorker({
      workspaceId: WORKSPACE_ID,
      jobId: job.id,
      packageInput: {
        campaignId: "campaign-1",
        recipe: {
          id: "kakao-moment-display-native",
          includeManifest: true,
          includeValidationReport: true,
        },
      },
      items: [
        {
          recordId: item.id,
          creativeVersionId: CREATIVE_VERSION_ID,
          relativePath: "KAKAO_MOMENT/DISPLAY_NATIVE_2_1/creative.png",
          eligibility: {
            creativeVersionId: CREATIVE_VERSION_ID,
            currentCreativeVersionId: CREATIVE_VERSION_ID,
            approval: {
              status: "APPROVED",
              creativeVersionId: CREATIVE_VERSION_ID,
              validationRunId: validationResult.run.id,
            },
            validationRun: {
              id: validationResult.run.id,
              creativeVersionId: CREATIVE_VERSION_ID,
              status: validationResult.status,
              summaryJson: validationResult.summary,
            },
            formatProfile: {
              id: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
              status: "ACTIVE",
              exportable: true,
            },
            exportRecipe: { id: "kakao-moment-display-native", status: "ACTIVE" },
            asOf: "2026-08-21T00:00:00.000Z",
          },
          rendered: { bytes: rendered.outputBytes, checksumSha256: rendered.checksumSha256 },
        },
      ],
    });
    expect(exported.status).toBe("COMPLETED");
    expect(exported.package?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "CREATIVE", checksumSha256: rendered.checksumSha256 }),
      ]),
    );
    expect(exported.package?.package.checksumSha256).toBeDefined();
    expect(rendered.outputBytes.byteLength).toBe(rendered.bytes);
  });
});
