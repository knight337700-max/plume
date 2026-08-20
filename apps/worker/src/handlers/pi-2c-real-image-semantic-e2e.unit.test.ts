import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExportPackage } from "../../../../packages/infrastructure/src/export/build-package.js";
import { runDeterministicValidation } from "../../../../packages/core/src/modules/validation/deterministic-validator.js";
import { createInMemoryClientBrandRepositories } from "../../../../packages/core/src/modules/client-brand/repositories.js";
import { createInMemoryAssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import { createInMemoryCampaignRepositories } from "../../../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryCreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import {
  composeCanonicalProductCreative,
  renderCanonicalProductDocument,
  type CanonicalProductDependencies,
} from "./canonical-product.js";
import { PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID } from "../../../../packages/infrastructure/src/render/renderer-bindings.js";
import {
  semanticPlacementEvidenceFingerprint,
  type SemanticPlacementEvidence,
} from "../../../../packages/infrastructure/src/render/semantic-placement-evidence.js";

const workspaceId = "00000000-0000-4000-8000-00000000c2e1";
const campaignId = "00000000-0000-4000-8000-00000000c2e2";
const briefId = "00000000-0000-4000-8000-00000000c2e3";
const briefVersionId = "00000000-0000-4000-8000-00000000c2e4";
const brandId = "00000000-0000-4000-8000-00000000c2e5";
const productId = "00000000-0000-4000-8000-00000000c2e6";
const assetId = "00000000-0000-4000-8000-00000000c2e7";
const assetVersionId = "00000000-0000-4000-8000-00000000c2e8";
const fileObjectId = "00000000-0000-4000-8000-00000000c2e9";
const objectKey = `workspaces/${workspaceId}/uploads/semantic-input`;
const formatProfileId = PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function now(): string {
  return "2026-08-20T00:00:00.000Z";
}

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(
      path.join(process.cwd(), "packages/renderer-vendor/upstream/fixtures/valid", name),
    ),
  );
}

function fakeGateway(counter: { calls: number }) {
  return {
    execute: async () => {
      counter.calls += 1;
      return {
        status: "COMPLETED" as const,
        model: "fake-gpt-5.6-luna",
        latencyMs: 1,
        outputJson: {
          semanticPlacement: {
            status: "FOUND",
            primarySubjectBounds: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
            semanticRegion: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
            focalPoint: { x: 0.3, y: 0.3 },
            confidence: 0.9,
          },
          rationale: "Fake Product Workflow semantic fixture",
        },
      };
    },
  };
}

async function dependencies(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
  overrides: {
    readonly selectionCount?: number;
    readonly selectionLicense?: "VALID" | "EXPIRED";
    readonly fileMimeType?: string;
    readonly fileChecksumSha256?: string;
  } = {},
) {
  const checksum = sha256(bytes);
  const selectionCount = overrides.selectionCount ?? 1;
  const file: FileObjectRecord = {
    id: fileObjectId,
    workspaceId,
    storageProvider: "S3",
    bucket: "test",
    objectKey,
    originalFilename: mimeType === "image/jpeg" ? "semantic.jpg" : "semantic.png",
    mimeType: overrides.fileMimeType ?? mimeType,
    bytes: bytes.byteLength,
    checksumSha256: overrides.fileChecksumSha256 ?? checksum,
    metadataJson: {},
    createdAt: now(),
  };
  const campaignRepositories = createInMemoryCampaignRepositories({
    campaigns: [
      {
        id: campaignId,
        workspaceId,
        brandId,
        displayCode: "PI-2C",
        name: "PI-2C",
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
        contentJson: {
          creativeCopy: {
            advertiser: "자코모",
            headline: "자코모 프리미엄 소파",
            subcopy: "거실을 바꾸는 선택",
          },
        },
        sourceCitationsJson: [],
        brandProfileSnapshotJson: {},
        status: "CONFIRMED",
        createdAt: now(),
      },
    ],
    assetPoolSelections: Array.from({ length: selectionCount }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000c2e${index + 10}`,
      workspaceId,
      campaignId,
      productId,
      assetVersionId,
      status: "SELECTED" as const,
      licenseStatus: overrides.selectionLicense ?? ("VALID" as const),
      updatedAt: now(),
    })),
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
        brandId,
        name: "Sofa Sample",
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
  const clientBrandRepositories = createInMemoryClientBrandRepositories({
    brands: [
      {
        id: brandId,
        workspaceId,
        advertiserId: "advertiser-1",
        name: "자코모",
        normalizedName: "자코모",
        status: "ACTIVE",
        revisionNo: 1,
      },
    ],
    products: [
      {
        id: productId,
        workspaceId,
        brandId,
        name: "JACOMO Sofa Semantic Fixture",
        normalizedName: "jacomo sofa semantic fixture",
        sellingPoints: [],
        attributes: {},
        status: "ACTIVE",
        revisionNo: 1,
      },
    ],
  });
  const creativeRepositories = createInMemoryCreativeRepositories();
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
      if (requestObjectKey !== objectKey) throw new Error("OBJECT_NOT_FOUND");
      return bytes.slice();
    },
    async presign() {
      return { url: "https://storage.invalid", expiresAt: now(), method: "GET" as const };
    },
    async deleteTemp() {},
  };
  const counter = { calls: 0 };
  const deps: CanonicalProductDependencies = {
    campaignRepositories,
    assetRepositories,
    creativeRepositories,
    clientBrandRepositories,
    providerGateway: fakeGateway(counter),
    fileObjectReader: {
      async getFileObject(requestWorkspace, requestFileId) {
        return requestWorkspace === workspaceId && requestFileId === fileObjectId ? file : null;
      },
    },
    storage,
  };
  return { deps, counter };
}

async function runFakeFlow(bytes: Uint8Array, mimeType: "image/png" | "image/jpeg") {
  const harness = await dependencies(bytes, mimeType);
  const uploaded = await harness.deps.storage.put({
    body: bytes,
    contentType: mimeType,
    objectKey,
  });
  expect(uploaded.checksumSha256).toBe(sha256(bytes));
  const generated = await composeCanonicalProductCreative(harness.deps, {
    workspaceId,
    campaignId,
    productId,
    briefVersionId,
    formatProfileId,
    sequence: 1,
    jobId: `job-${mimeType}`,
  });
  const evidence = generated.creative.document.metadata.semanticPlacement as Record<
    string,
    unknown
  >;
  const rendered = await renderCanonicalProductDocument(
    harness.deps,
    workspaceId,
    generated.creative.document,
    `render-${mimeType}`,
  );
  if (rendered.result.status !== "COMPLETED") throw new Error("PI_2C_FAKE_RENDER_FAILED");
  const validation = runDeterministicValidation({
    creativeDocument: generated.creative.document,
    rules: [],
    file: { bytes: rendered.result.outputBytes.byteLength, mimeType: "image/png" },
  });
  const exported = buildExportPackage({
    exportJobId: `export-${mimeType}`,
    recipe: { id: "pi-2c-fake", includeManifest: true, includeValidationReport: true },
    items: [
      {
        creativeVersionId: generated.creative.creativeVersionId,
        relativePath: "render.png",
        bytes: rendered.result.outputBytes,
      },
    ],
  });
  return {
    ...harness,
    generated,
    evidence,
    rendered,
    validation,
    exported,
    workflow: [
      "upload.session",
      "upload.put",
      "upload.complete",
      "asset.version.persist",
      "product.link",
      "brief.confirmed",
      "generation.request",
      "creative.generate",
      "creative.render",
      "validation.run",
      "export.render_and_package",
    ] as const,
  };
}

function storedZipEntry(zip: Uint8Array, expectedName: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (offset + 30 <= zip.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (method === 0 && name === expectedName)
      return zip.slice(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
  }
  throw new Error(`ZIP_ENTRY_NOT_FOUND:${expectedName}`);
}

describe("PI-2C fake-provider Product Workflow E2E", () => {
  it.each([
    ["PNG", "thumbnail-box-right__asset__basic__pass.png", "image/png"],
    ["JPEG", "thumbnail-box-right__asset__jpeg__pass.jpg", "image/jpeg"],
  ] as const)(
    "runs %s upload → generate → render → validation/export without render Agent calls",
    async (_label, file, mimeType) => {
      const result = await runFakeFlow(await fixture(file), mimeType);
      expect(result.counter.calls).toBe(1);
      expect(result.workflow).toEqual([
        "upload.session",
        "upload.put",
        "upload.complete",
        "asset.version.persist",
        "product.link",
        "brief.confirmed",
        "generation.request",
        "creative.generate",
        "creative.render",
        "validation.run",
        "export.render_and_package",
      ]);
      expect(result.generated.creative.document.metadata.semanticPlacement).toEqual(
        expect.objectContaining({
          schemaVersion: "1.0.0",
          gate: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E",
        }),
      );
      expect(result.generated.creative.document.metadata.semanticPlacement).not.toHaveProperty(
        "rawImage",
      );
      expect(result.rendered.result.status).toBe("COMPLETED");
      if (result.rendered.result.status !== "COMPLETED") return;
      expect(result.counter.calls).toBe(1);
      expect(result.rendered.result.width).toBe(1029);
      expect(result.rendered.result.height).toBe(258);
      expect(
        result.rendered.result.renderMetadata.rendererIntegrationOutput?.validation.errors,
      ).toEqual([]);
      expect(result.validation.status).toBe("PASS");
      expect(result.exported.status).toBe("COMPLETED");
      expect(result.exported.manifest.files[0]?.checksumSha256).toBe(
        sha256(result.rendered.result.outputBytes),
      );
      expect(Array.from(storedZipEntry(result.exported.zipBytes, "render.png"))).toEqual(
        Array.from(result.rendered.result.outputBytes),
      );
    },
  );

  it("fails closed for missing evidence, fingerprint tamper, and source drift", async () => {
    const bytes = await fixture("thumbnail-box-right__asset__basic__pass.png");
    const baseline = await runFakeFlow(bytes, "image/png");
    const missing = {
      ...baseline.generated.creative.document,
      metadata: { ...baseline.generated.creative.document.metadata },
    };
    delete (missing.metadata as Record<string, unknown>).semanticPlacement;
    await expect(
      renderCanonicalProductDocument(baseline.deps, workspaceId, missing, "missing-evidence"),
    ).rejects.toMatchObject({ code: "SEMANTIC_EVIDENCE_MISSING" });
    const tampered = {
      ...baseline.generated.creative.document,
      metadata: {
        ...baseline.generated.creative.document.metadata,
        semanticPlacement: { ...baseline.evidence, evidenceFingerprint: "0".repeat(64) },
      },
    };
    await expect(
      renderCanonicalProductDocument(baseline.deps, workspaceId, tampered, "tampered-evidence"),
    ).rejects.toMatchObject({ code: "SEMANTIC_EVIDENCE_FINGERPRINT_MISMATCH" });
    const drift = {
      ...baseline.generated.creative.document,
      metadata: {
        ...baseline.generated.creative.document.metadata,
        semanticPlacement: {
          ...baseline.evidence,
          source: {
            ...(baseline.evidence.source as Record<string, unknown>),
            checksumSha256: "1".repeat(64),
          },
        },
      },
    };
    await expect(
      renderCanonicalProductDocument(baseline.deps, workspaceId, drift, "source-drift"),
    ).rejects.toMatchObject({ code: "SEMANTIC_EVIDENCE_FINGERPRINT_MISMATCH" });
    const sourceDriftEvidence = {
      ...baseline.evidence,
      source: {
        ...(baseline.evidence.source as Record<string, unknown>),
        checksumSha256: "1".repeat(64),
      },
    } as Omit<SemanticPlacementEvidence, "evidenceFingerprint">;
    const sourceDriftRehashed = {
      ...baseline.generated.creative.document,
      metadata: {
        ...baseline.generated.creative.document.metadata,
        semanticPlacement: {
          ...sourceDriftEvidence,
          evidenceFingerprint: semanticPlacementEvidenceFingerprint(sourceDriftEvidence),
        },
      },
    };
    await expect(
      renderCanonicalProductDocument(
        baseline.deps,
        workspaceId,
        sourceDriftRehashed,
        "source-drift-rehashed",
      ),
    ).rejects.toMatchObject({ code: "SEMANTIC_SOURCE_EVIDENCE_DRIFT" });
    const candidatePlanMismatchEvidence = {
      ...baseline.evidence,
      acceptedPlan: {
        ...(baseline.evidence.acceptedPlan as Record<string, unknown>),
        cropCandidateId: "semantic-mismatch",
      },
    } as Omit<SemanticPlacementEvidence, "evidenceFingerprint">;
    const candidatePlanMismatch = {
      ...baseline.generated.creative.document,
      metadata: {
        ...baseline.generated.creative.document.metadata,
        semanticPlacement: {
          ...candidatePlanMismatchEvidence,
          evidenceFingerprint: semanticPlacementEvidenceFingerprint(candidatePlanMismatchEvidence),
        },
      },
    };
    await expect(
      renderCanonicalProductDocument(
        baseline.deps,
        workspaceId,
        candidatePlanMismatch,
        "candidate-plan-mismatch",
      ),
    ).rejects.toMatchObject({ code: "SEMANTIC_CANDIDATE_PLAN_MISMATCH" });
  });

  it("fails closed for Thumbnail asset selection, license, MIME, and checksum negatives", async () => {
    const bytes = await fixture("thumbnail-box-right__asset__basic__pass.png");
    const compose = (deps: CanonicalProductDependencies, jobId: string) =>
      composeCanonicalProductCreative(deps, {
        workspaceId,
        campaignId,
        productId,
        briefVersionId,
        formatProfileId,
        sequence: 1,
        jobId,
      });
    await expect(
      compose(
        (await dependencies(bytes, "image/png", { selectionCount: 0 })).deps,
        "job-no-selected",
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_REQUIRED" });
    await expect(
      compose(
        (await dependencies(bytes, "image/png", { selectionCount: 2 })).deps,
        "job-multiple-selected",
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_AMBIGUOUS" });
    await expect(
      compose(
        (await dependencies(bytes, "image/png", { selectionLicense: "EXPIRED" })).deps,
        "job-invalid-license",
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_LICENSE_INVALID" });
    await expect(
      compose(
        (await dependencies(bytes, "image/png", { fileMimeType: "image/gif" })).deps,
        "job-unsupported-mime",
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_MIME_INVALID" });
    await expect(
      compose(
        (await dependencies(bytes, "image/png", { fileChecksumSha256: "0".repeat(64) })).deps,
        "job-checksum-drift",
      ),
    ).rejects.toMatchObject({ code: "CANONICAL_PRODUCT_ASSET_CHECKSUM_MISMATCH" });
  });
});
