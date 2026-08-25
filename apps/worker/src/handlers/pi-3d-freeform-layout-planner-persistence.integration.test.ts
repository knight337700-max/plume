import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryAssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import type {
  AgentOrchestrator,
  AgentTaskInput,
} from "../../../../packages/core/src/agents/orchestrator.js";
import type { AgentResult } from "../../../../packages/core/src/agents/agent-result.js";
import { createInMemoryCampaignRepositories } from "../../../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryCreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import { runDeterministicValidation } from "../../../../packages/core/src/modules/validation/deterministic-validator.js";
import { buildExportPackage } from "../../../../packages/infrastructure/src/export/build-package.js";
import {
  createFreeformLayoutEvidence,
  freeformLayoutPlanSha256,
  getKakaoDisplayNative21FormatProfile,
} from "../../../../packages/infrastructure/src/render/freeform-layout-contract.js";
import { PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID } from "../../../../packages/infrastructure/src/render/renderer-bindings.js";
import {
  loadFreeformFontRegistry,
  type CreativeLayoutPlan,
} from "../../../../packages/renderer-vendor/src/public.js";
import {
  composeCanonicalProductCreative,
  renderCanonicalProductDocument,
  type CanonicalProductDependencies,
} from "./canonical-product.js";

const workspaceId = "00000000-0000-4000-8000-000000003d01";
const campaignId = "00000000-0000-4000-8000-000000003d02";
const briefId = "00000000-0000-4000-8000-000000003d03";
const briefVersionId = "00000000-0000-4000-8000-000000003d04";
const productId = "00000000-0000-4000-8000-000000003d05";
const assetId = "00000000-0000-4000-8000-000000003d06";
const assetVersionId = "00000000-0000-4000-8000-000000003d07";
const fileObjectId = "00000000-0000-4000-8000-000000003d08";
const jobId = "00000000-0000-4000-8000-000000003d09";
const objectKey = `workspaces/${workspaceId}/uploads/pi-3d-freeform.png`;
const formatProfileId = PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID;
const copy = {
  advertiser: "자코모",
  headline: "자코모 프리미엄 소파",
  subcopy: "거실을 바꾸는 선택",
} as const;

function now(): string {
  return "2026-08-22T00:00:00.000Z";
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function layoutPlan(): CreativeLayoutPlan {
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
        assetId: assetVersionId,
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

function fakePlanner(plan: CreativeLayoutPlan) {
  const calls: AgentTaskInput[] = [];
  const orchestrator: AgentOrchestrator = {
    async run<T>(input: AgentTaskInput): Promise<AgentResult<T>> {
      calls.push(input);
      return {
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        agentCode: input.agentCode,
        status: "COMPLETED",
        output: plan as T,
        metadata: {
          promptId: "layout_planner-system",
          promptVersion: "1.0.0",
          promptHash: "f".repeat(64),
          modelPolicyId: "vision-quality-v1",
          contextHash: "e".repeat(64),
          attempt: 1,
          latencyMs: 1,
        },
        stateTransitions: ["QUEUED", "RUNNING", "COMPLETED"],
      };
    },
  };
  return { calls, orchestrator };
}

async function fixtureBytes(): Promise<Uint8Array> {
  return new Uint8Array(
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
}

async function dependencies(bytes: Uint8Array, planner: AgentOrchestrator) {
  const checksum = sha256(bytes);
  const campaignRepositories = createInMemoryCampaignRepositories({
    campaigns: [
      {
        id: campaignId,
        workspaceId,
        brandId: "brand-pi-3d",
        displayCode: "PI-3D",
        name: "PI-3D",
        objectiveCode: "SALES",
        status: "DRAFT",
        currentStep: "READY",
        revisionNo: 1,
        createdAt: now(),
        updatedAt: now(),
      },
    ],
    briefs: [
      { id: briefId, workspaceId, campaignId, currentVersionId: briefVersionId, revisionNo: 1 },
    ],
    briefVersions: [
      {
        id: briefVersionId,
        workspaceId,
        campaignBriefId: briefId,
        versionNo: 1,
        sourceKind: "MANUAL",
        contentJson: { creativeCopy: copy },
        sourceCitationsJson: [],
        brandProfileSnapshotJson: {},
        status: "CONFIRMED",
        createdAt: now(),
      },
    ],
    assetPoolSelections: [
      {
        id: "00000000-0000-4000-8000-000000003d10",
        workspaceId,
        campaignId,
        productId,
        assetVersionId,
        status: "SELECTED",
        licenseStatus: "VALID",
        updatedAt: now(),
      },
    ],
    formatSelections: [
      {
        id: formatProfileId,
        workspaceId,
        campaignId,
        channelCode: "KAKAO_MOMENT",
        formatProfileId,
        profileVersion: "2026.1",
        status: "SELECTED",
        snapshotJson: {},
        updatedAt: now(),
      },
    ],
  });
  const assetRepositories = createInMemoryAssetRepositories({
    assets: [
      {
        id: assetId,
        workspaceId,
        brandId: "brand-pi-3d",
        name: "PI-3D selected product",
        assetType: "IMAGE",
        status: "ACTIVE",
        licenseStatus: "VALID",
        analysisSummaryJson: {},
        revisionNo: 1,
        createdAt: now(),
        updatedAt: now(),
      },
    ],
    versions: [
      {
        id: assetVersionId,
        workspaceId,
        designAssetId: assetId,
        versionNo: 1,
        fileObjectId,
        sourceType: "UPLOAD",
        analysisJson: {},
        createdAt: now(),
      },
    ],
  });
  const file: FileObjectRecord = {
    id: fileObjectId,
    workspaceId,
    storageProvider: "S3",
    bucket: "test",
    objectKey,
    originalFilename: "thumbnail-box-right__asset__basic__pass.png",
    mimeType: "image/png",
    bytes: bytes.byteLength,
    checksumSha256: checksum,
    metadataJson: {},
    createdAt: now(),
  };
  const storage = {
    createObjectKey: () => objectKey,
    async put(input: { body: Uint8Array; objectKey?: string }) {
      return {
        bucket: "test",
        objectKey: input.objectKey ?? objectKey,
        bytes: input.body.byteLength,
        checksumSha256: sha256(input.body),
        etag: sha256(input.body),
      };
    },
    async head() {
      return null;
    },
    async get(requestObjectKey: string) {
      if (requestObjectKey !== objectKey) throw new Error("PI_3D_STORAGE_OBJECT_NOT_FOUND");
      return bytes.slice();
    },
    async presign() {
      return { url: "https://storage.invalid", expiresAt: now(), method: "GET" as const };
    },
    async deleteTemp() {},
  };
  const deps: CanonicalProductDependencies = {
    campaignRepositories,
    assetRepositories,
    creativeRepositories: createInMemoryCreativeRepositories(),
    fileObjectReader: {
      async getFileObject(requestWorkspace, requestFileId) {
        return requestWorkspace === workspaceId && requestFileId === fileObjectId ? file : null;
      },
    },
    storage,
    agentOrchestrator: planner,
  };
  return { deps, checksum };
}

describe("PI-3D FREEFORM planner persistence and reloaded render", () => {
  it("persists one planner result, ignores payload layout tamper, and rejects persisted evidence tamper", async () => {
    const bytes = await fixtureBytes();
    expect(sha256(bytes)).toBe("fd5d6e48ebbf443f10f40af1b70091649b208bc7118f64dc3a990434915fc2fe");
    const targetProfile = getKakaoDisplayNative21FormatProfile();
    const fontRegistry = loadFreeformFontRegistry();
    const plannerOutput = layoutPlan();
    const evidence = createFreeformLayoutEvidence(plannerOutput, {
      expectedRendererAssetId: assetVersionId,
      confirmedCopy: { headline: copy.headline, subcopy: copy.subcopy },
      profile: targetProfile,
      fontRegistry,
    });
    const fake = fakePlanner(plannerOutput);
    const { deps, checksum } = await dependencies(bytes, fake.orchestrator);
    const first = await composeCanonicalProductCreative(deps, {
      workspaceId,
      campaignId,
      productId,
      briefVersionId,
      formatProfileId,
      sequence: 1,
      jobId,
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.agentCode).toBe("LAYOUT_PLANNER");
    expect(fake.calls[0]?.imageInputs).toHaveLength(1);
    expect(fake.calls[0]?.imageInputs?.[0]?.fileId).toBe(assetVersionId);
    expect(fake.calls[0]?.imageInputs?.[0]?.checksumSha256).toBe(checksum);
    expect(fake.calls[0]?.imageInputs?.[0]?.bytes).toEqual(bytes);
    expect(first.creative.document.metadata.layoutMode).toBe("FREEFORM");
    expect(first.creative.document.layoutTemplateId).toBeNull();
    expect(first.creative.document.metadata.freeformLayoutEvidence).toMatchObject({
      creativeLayoutPlanSha256: freeformLayoutPlanSha256(plannerOutput),
    });
    expect(first.creative.document.metadata.freeformLayoutEvidence).toEqual(
      evidence.freeformLayoutEvidence,
    );

    const persistedVersions = await deps.creativeRepositories.listVersions(
      workspaceId,
      first.creative.creativeId,
    );
    expect(persistedVersions).toHaveLength(1);
    expect(persistedVersions[0]?.generationMetadataJson).toMatchObject({
      renderMode: "CANONICAL_RENDERER",
      assetVersionId,
      freeformLayoutPlanSha256: freeformLayoutPlanSha256(plannerOutput),
      layoutPlannerTaskId: `${jobId}:layout-planner:${productId}`,
    });
    expect(persistedVersions[0]?.generationMetadataJson).not.toHaveProperty("creativeLayoutPlan");

    const second = await composeCanonicalProductCreative(deps, {
      workspaceId,
      campaignId,
      productId,
      briefVersionId,
      formatProfileId,
      sequence: 1,
      jobId,
    });
    expect(fake.calls).toHaveLength(1);
    expect(second.creative.creativeVersionId).toBe(first.creative.creativeVersionId);
    expect(
      await deps.creativeRepositories.listVersions(workspaceId, first.creative.creativeId),
    ).toHaveLength(1);

    const baseline = await renderCanonicalProductDocument(
      deps,
      workspaceId,
      first.creative.document,
      "pi-3d-render-baseline",
      first.creative.creativeVersionId,
    );
    expect(baseline.result.status).toBe("COMPLETED");
    if (baseline.result.status !== "COMPLETED") return;
    expect(baseline.result.width).toBe(1200);
    expect(baseline.result.height).toBe(600);
    expect(baseline.result.bytes).toBeLessThanOrEqual(500000);
    expect(baseline.result.renderMetadata.rendererIntegrationContract).toBe("1.8.0");
    expect(baseline.result.renderMetadata.rendererCommit).toBe(
      "7baa272dd852ed21a09cf369c928571b3f75fd31",
    );
    expect(baseline.result.renderMetadata.legacyFallbackUsed).toBe(false);
    expect(baseline.result.renderMetadata.artifactFormat).toBe("PNG");
    expect(baseline.result.renderMetadata.rendererWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "KBR-FREEFORM-MANUAL-REVIEW-REQUIRED" }),
      ]),
    );

    const tamperedPayload = {
      ...JSON.parse(JSON.stringify(first.creative.document)),
      formatProfileId: "kakao-moment-bizboard-1029x258",
    } as typeof first.creative.document;
    const tamperedImage = tamperedPayload.elements.find((element) => element.type === "IMAGE");
    if (!tamperedImage) throw new Error("PI_3D_IMAGE_ELEMENT_MISSING");
    (tamperedImage as { x: number }).x = 0;
    const reloaded = await renderCanonicalProductDocument(
      deps,
      workspaceId,
      tamperedPayload,
      "pi-3d-render-payload-tamper",
      first.creative.creativeVersionId,
    );
    expect(reloaded.result.status).toBe("COMPLETED");
    if (reloaded.result.status !== "COMPLETED") return;
    expect(reloaded.result.outputBytes).toEqual(baseline.result.outputBytes);
    expect(reloaded.result.checksumSha256).toBe(baseline.result.checksumSha256);
    expect(reloaded.result.renderMetadata.pixelFingerprint).toBe(
      baseline.result.renderMetadata.pixelFingerprint,
    );
    expect(reloaded.result.renderMetadata.renderFingerprint).toBe(
      baseline.result.renderMetadata.renderFingerprint,
    );

    const version = await deps.creativeRepositories.getVersion(
      workspaceId,
      first.creative.creativeVersionId,
    );
    if (!version) throw new Error("PI_3D_PERSISTED_VERSION_MISSING");
    const persistedEvidence = version.documentJson.metadata.freeformLayoutEvidence as Record<
      string,
      unknown
    >;
    const persistedDocument = JSON.parse(
      JSON.stringify(version.documentJson),
    ) as typeof version.documentJson;
    const tamperedEvidence = {
      ...persistedEvidence,
      creativeLayoutPlanSha256: "0".repeat(64),
    };
    const tamperedDocument = {
      ...persistedDocument,
      metadata: { ...persistedDocument.metadata, freeformLayoutEvidence: tamperedEvidence },
    };
    await deps.creativeRepositories.updateDraftVersion(workspaceId, version.id, {
      documentJson: tamperedDocument,
    });
    await expect(
      renderCanonicalProductDocument(
        deps,
        workspaceId,
        first.creative.document,
        "pi-3d-render-persisted-tamper",
        first.creative.creativeVersionId,
      ),
    ).rejects.toMatchObject({
      code: "CANONICAL_FREEFORM_LAYOUT_EVIDENCE_INVALID",
      causeCode: "FREEFORM_LAYOUT_EVIDENCE_HASH_MISMATCH",
    });
    await deps.creativeRepositories.updateDraftVersion(workspaceId, version.id, {
      documentJson: version.documentJson,
    });

    const replay = await renderCanonicalProductDocument(
      deps,
      workspaceId,
      first.creative.document,
      "pi-3d-render-replay",
      first.creative.creativeVersionId,
    );
    expect(replay.result.status).toBe("COMPLETED");
    if (replay.result.status !== "COMPLETED") return;
    expect(replay.result.outputBytes).toEqual(baseline.result.outputBytes);
    expect(replay.result.checksumSha256).toBe(baseline.result.checksumSha256);
    expect(replay.result.renderMetadata.pixelFingerprint).toBe(
      baseline.result.renderMetadata.pixelFingerprint,
    );
    expect(replay.result.renderMetadata.renderFingerprint).toBe(
      baseline.result.renderMetadata.renderFingerprint,
    );

    const validation = runDeterministicValidation({
      creativeDocument: first.creative.document,
      rules: [],
      file: {
        bytes: baseline.result.bytes,
        mimeType: "image/png",
        magicMimeType: "image/png",
        alpha: false,
      },
    });
    expect(validation.status).toBe("PASS");
    expect(validation.findings.filter((finding) => finding.severity === "ERROR")).toHaveLength(0);
    const exported = buildExportPackage({
      exportJobId: "pi-3d-export",
      workspaceId,
      campaignId,
      recipe: {
        id: "pi-3d-kakao-display-native",
        includeManifest: true,
        includeValidationReport: true,
      },
      items: [
        {
          creativeVersionId: first.creative.creativeVersionId,
          relativePath: "KAKAO_MOMENT/DISPLAY_NATIVE_2_1/creative.png",
          mimeType: "image/png",
          bytes: baseline.result.outputBytes,
        },
      ],
    });
    expect(exported.status).toBe("COMPLETED");
    expect(exported.manifest.files[0]?.checksumSha256).toBe(baseline.result.checksumSha256);
    expect(exported.zipBytes.byteLength).toBeGreaterThan(0);

    process.stdout.write(
      `PI3D_EVIDENCE ${JSON.stringify({
        workspaceId,
        campaignId,
        productId,
        creativeId: first.creative.creativeId,
        creativeVersionId: first.creative.creativeVersionId,
        assetVersionId,
        fixture:
          "packages/renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
        fixtureSha256: checksum,
        plannerCalls: fake.calls.length,
        agentCode: fake.calls[0]?.agentCode,
        imageInputBytes: fake.calls[0]?.imageInputs?.[0]?.bytes.byteLength,
        imageInputChecksumSha256: fake.calls[0]?.imageInputs?.[0]?.checksumSha256,
        planSha256: freeformLayoutPlanSha256(plannerOutput),
        layoutMode: first.creative.document.metadata.layoutMode,
        rendererFormatProfileId:
          first.creative.document.metadata.freeformLayoutEvidence &&
          (
            first.creative.document.metadata.freeformLayoutEvidence as {
              rendererFormatProfileId: string;
            }
          ).rendererFormatProfileId,
        canvas: { width: baseline.result.width, height: baseline.result.height },
        outputBytes: baseline.result.bytes,
        outputChecksumSha256: baseline.result.checksumSha256,
        requestFingerprint: baseline.result.renderMetadata.requestFingerprint,
        pixelFingerprint: baseline.result.renderMetadata.pixelFingerprint,
        renderFingerprint: baseline.result.renderMetadata.renderFingerprint,
        rendererCommit: baseline.result.renderMetadata.rendererCommit,
        rendererContract: baseline.result.renderMetadata.rendererIntegrationContract,
        rendererWarnings: baseline.result.renderMetadata.rendererWarnings,
        validationStatus: validation.status,
        validationErrors: validation.findings.filter((finding) => finding.severity === "ERROR")
          .length,
        exportStatus: exported.status,
        exportChecksumSha256: exported.checksumSha256,
        exportBytes: exported.zipBytes.byteLength,
        persistedTamperCode: "CANONICAL_FREEFORM_LAYOUT_EVIDENCE_INVALID",
      })}\n`,
    );
  });
});
