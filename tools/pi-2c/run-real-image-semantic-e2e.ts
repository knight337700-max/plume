import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { createOpenAIProviderGateway } from "../../packages/infrastructure/src/ai/openai-gateway.js";
import { inspectImageBytes } from "../../packages/renderer-vendor/src/public.js";
import { buildExportPackage } from "../../packages/infrastructure/src/export/build-package.js";
import { runDeterministicValidation } from "../../packages/core/src/modules/validation/deterministic-validator.js";
import { createInMemoryClientBrandRepositories } from "../../packages/core/src/modules/client-brand/repositories.js";
import { createInMemoryAssetRepositories } from "../../packages/core/src/modules/asset/repositories.js";
import { createInMemoryCampaignRepositories } from "../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryCreativeRepositories } from "../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../packages/core/src/modules/asset/upload-session.js";
import {
  composeCanonicalProductCreative,
  renderCanonicalProductDocument,
  type CanonicalProductDependencies,
} from "../../apps/worker/src/handlers/canonical-product.js";
import { PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID as FORMAT_PROFILE_ID } from "../../packages/infrastructure/src/render/renderer-bindings.js";

const execFile = promisify(execFileCallback);
const SAMPLE_ZIP =
  "C:/Users/Lenovo/Desktop/Ogilvy/evidence/PI-2_semantic_placement_sample_images.zip";
const EXPECTED_ZIP_SHA256 = "91d594149c8fb69dc4835110393b44269d57ef3f1fbbfc56e26382f1e9db5fed";
const REVIEW_ROOT = "C:/Users/Lenovo/Desktop/Ogilvy/evidence/pi-2c-review";
const REVIEW_PACK_NAME = "PI-2C-Thumbnail-Semantic-Review-Pack.zip";
const SAMPLES = [
  ["A_centered", "sample_A_centered_subject.png"],
  ["B_left_weighted", "sample_B_left_weighted.png"],
  ["C_right_weighted", "sample_C_right_weighted.png"],
  ["D_wide_negative_space", "sample_D_wide_negative_space.png"],
  ["E_edge_near", "sample_E_edge_near_subject.png"],
  ["F_complex", "sample_F_complex_scene.png"],
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function now(): string {
  return new Date().toISOString();
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: "PI_2C_LIVE_REVIEW_BLOCKED" });
}

async function prepareSamples(): Promise<{ readonly root: string; readonly zipSha256: string }> {
  const zipBytes = await readFile(SAMPLE_ZIP);
  const zipSha256 = sha256(zipBytes);
  if (zipSha256 !== EXPECTED_ZIP_SHA256) fail(`SAMPLE_ZIP_HASH_MISMATCH:${zipSha256}`);
  const root = await mkdtemp(path.join(os.tmpdir(), "plume-pi-2c-samples-"));
  await execFile("tar", ["-xf", SAMPLE_ZIP, "-C", root]);
  return { root, zipSha256 };
}

function sampleFile(root: string, filename: string): string {
  return path.join(root, filename);
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

function assertReviewJsonSafe(bytes: Uint8Array, relativePath: string): void {
  const text = new TextDecoder().decode(bytes);
  if (
    /OPENAI_API_KEY|Bearer\s|data:image\/|Authorization/iu.test(text) ||
    /^[A-Za-z0-9+/]{256,}={0,2}$/mu.test(text)
  )
    fail(`REVIEW_PACK_SECRET_SCAN_FAILED:${relativePath}`);
}

async function makeDependencies(
  sampleKey: string,
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
  gateway: ReturnType<typeof createOpenAIProviderGateway>,
): Promise<{
  readonly deps: CanonicalProductDependencies;
  readonly ids: Readonly<Record<string, string>>;
  readonly providerCalls: { calls: number };
}> {
  const suffix = sampleKey.toLowerCase().replace(/[^a-z0-9]/gu, "");
  const workspaceId = `pi2c-${suffix}`;
  const campaignId = `campaign-${suffix}`;
  const briefId = `brief-${suffix}`;
  const briefVersionId = `brief-version-${suffix}`;
  const brandId = `brand-${suffix}`;
  const productId = `product-${suffix}`;
  const assetId = `asset-${suffix}`;
  const assetVersionId = `asset-version-${suffix}`;
  const fileObjectId = `file-${suffix}`;
  const objectKey = `workspaces/${workspaceId}/uploads/${suffix}`;
  const checksum = sha256(bytes);
  const timestamp = now();
  const file: FileObjectRecord = {
    id: fileObjectId,
    workspaceId,
    storageProvider: "S3",
    bucket: "pi-2c",
    objectKey,
    originalFilename: `${suffix}.${mimeType === "image/jpeg" ? "jpg" : "png"}`,
    mimeType,
    bytes: bytes.byteLength,
    checksumSha256: checksum,
    metadataJson: {},
    createdAt: timestamp,
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
        createdAt: timestamp,
        updatedAt: timestamp,
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
        createdAt: timestamp,
      },
    ],
    assetPoolSelections: [
      {
        id: `selection-${suffix}`,
        workspaceId,
        campaignId,
        productId,
        assetVersionId,
        status: "SELECTED",
        licenseStatus: "VALID",
        updatedAt: timestamp,
      },
    ],
    formatSelections: [
      {
        id: FORMAT_PROFILE_ID,
        workspaceId,
        campaignId,
        channelCode: "KAKAO_MOMENT",
        formatProfileId: FORMAT_PROFILE_ID,
        profileVersion: "2026.1",
        status: "SELECTED",
        snapshotJson: {},
        updatedAt: timestamp,
      },
    ],
  });
  const assetRepositories = createInMemoryAssetRepositories({
    assets: [
      {
        id: assetId,
        workspaceId,
        brandId,
        name: `JACOMO Sofa Semantic Sample ${sampleKey}`,
        assetType: "IMAGE",
        status: "ACTIVE",
        licenseStatus: "VALID",
        analysisSummaryJson: {},
        revisionNo: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
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
        createdAt: timestamp,
      },
    ],
  });
  const clientBrandRepositories = createInMemoryClientBrandRepositories({
    brands: [
      {
        id: brandId,
        workspaceId,
        advertiserId: `advertiser-${suffix}`,
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
        name: `JACOMO Sofa Semantic Sample ${sampleKey}`,
        normalizedName: `jacomo sofa semantic sample ${suffix}`,
        sellingPoints: [],
        attributes: {},
        status: "ACTIVE",
        revisionNo: 1,
      },
    ],
  });
  const creativeRepositories = createInMemoryCreativeRepositories();
  const providerCalls = { calls: 0 };
  const storage = {
    createObjectKey: () => objectKey,
    async put(input: { readonly body: Uint8Array; readonly objectKey?: string }) {
      return {
        bucket: "pi-2c",
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
      return { url: "https://storage.invalid", expiresAt: timestamp, method: "GET" as const };
    },
    async deleteTemp() {},
  };
  return {
    deps: {
      campaignRepositories,
      assetRepositories,
      creativeRepositories,
      clientBrandRepositories,
      providerGateway: {
        async execute(request) {
          providerCalls.calls += 1;
          const result = await gateway.execute({
            ...request,
            outputSchema: request.outputSchema as Readonly<Record<string, unknown>>,
            metadata: {
              ...request.metadata,
              environment: "local",
              gate: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E",
              customerData: "synthetic",
            },
          });
          return {
            status: result.status,
            ...(result.outputJson === undefined ? {} : { outputJson: result.outputJson }),
            ...(result.model ? { model: result.model } : {}),
            latencyMs: result.latencyMs,
            ...(result.error ? { error: result.error } : {}),
            ...(result.evidence ? { evidence: result.evidence } : {}),
          };
        },
      },
      fileObjectReader: {
        async getFileObject(requestWorkspace, requestFileId) {
          return requestWorkspace === workspaceId && requestFileId === fileObjectId ? file : null;
        },
      },
      storage,
    },
    ids: { workspaceId, campaignId, productId, assetVersionId, fileObjectId },
    providerCalls,
  };
}

async function runSample(
  sampleKey: string,
  filename: string,
  sampleRoot: string,
  gateway: ReturnType<typeof createOpenAIProviderGateway>,
  outputRoot: string,
) {
  const inputBytes = await readFile(sampleFile(sampleRoot, filename));
  const metadata = await inspectImageBytes(inputBytes);
  const mimeType = metadata.detectedMimeType;
  const { deps, ids, providerCalls } = await makeDependencies(
    sampleKey,
    inputBytes,
    mimeType,
    gateway,
  );
  const uploaded = await deps.storage.put({
    body: inputBytes,
    contentType: mimeType,
  });
  if (uploaded.checksumSha256 !== sha256(inputBytes)) fail(`${sampleKey}:UPLOAD_CHECKSUM_MISMATCH`);
  const generated = await composeCanonicalProductCreative(deps, {
    workspaceId: ids.workspaceId,
    campaignId: ids.campaignId,
    productId: ids.productId,
    briefVersionId: `brief-version-${sampleKey.toLowerCase().replace(/[^a-z0-9]/gu, "")}`,
    formatProfileId: FORMAT_PROFILE_ID,
    sequence: 1,
    jobId: `pi2c-${sampleKey}`,
  });
  const generateAgentCalls = providerCalls.calls;
  if (generateAgentCalls !== 1)
    fail(`${sampleKey}:GENERATE_AGENT_CALL_COUNT:${generateAgentCalls}`);
  const rendered = await renderCanonicalProductDocument(
    deps,
    ids.workspaceId,
    generated.creative.document,
    `render-${sampleKey}`,
  );
  if (providerCalls.calls !== generateAgentCalls)
    fail(`${sampleKey}:RENDER_AGENT_CALL_COUNT:${providerCalls.calls - generateAgentCalls}`);
  if (rendered.result.status !== "COMPLETED") fail(`${sampleKey}:RENDER_BLOCKED`);
  const renderBytes = rendered.result.outputBytes;
  const validation = runDeterministicValidation({
    creativeDocument: generated.creative.document,
    rules: [],
  });
  if (validation.status !== "PASS") fail(`${sampleKey}:VALIDATION_NOT_PASS`);
  const exported = buildExportPackage({
    exportJobId: `export-${sampleKey}`,
    recipe: { id: "pi-2c-review", includeManifest: true, includeValidationReport: true },
    items: [
      {
        creativeVersionId: generated.creative.creativeVersionId,
        relativePath: "render.png",
        bytes: renderBytes,
      },
    ],
  });
  const embeddedRenderBytes = storedZipEntry(exported.zipBytes, "render.png");
  if (sha256(embeddedRenderBytes) !== sha256(renderBytes))
    fail(`${sampleKey}:EXPORT_RENDER_BYTES_MISMATCH`);
  const directory = path.join(outputRoot, sampleKey);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "input.png"), inputBytes);
  await writeFile(path.join(directory, "render.png"), renderBytes);
  await writeFile(
    path.join(directory, "semantic-agent.json"),
    JSON.stringify(generated.creative.document.metadata.semanticPlacement, null, 2),
  );
  const evidence = generated.creative.document.metadata.semanticPlacement as Record<
    string,
    unknown
  >;
  await writeFile(
    path.join(directory, "crop-candidate.json"),
    JSON.stringify(evidence.candidate, null, 2),
  );
  await writeFile(
    path.join(directory, "accepted-plan.json"),
    JSON.stringify(evidence.acceptedPlan, null, 2),
  );
  await writeFile(
    path.join(directory, "product-flow.json"),
    JSON.stringify(
      {
        upload: "COMPLETED",
        assetVersion: ids.assetVersionId,
        fileObject: ids.fileObjectId,
        product: ids.productId,
        confirmedBrief: `brief-version-${sampleKey.toLowerCase().replace(/[^a-z0-9]/gu, "")}`,
        generation: "COMPLETED",
        creative: generated.creative.creativeVersionId,
        commands: [
          "creative.generate",
          "creative.render",
          "validation.run",
          "export.render_and_package",
        ],
        agentCallsDuringGenerate: generateAgentCalls,
        agentCallsDuringRender: providerCalls.calls - generateAgentCalls,
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(directory, "renderer-output.json"),
    JSON.stringify(
      {
        status: "PASS",
        artifactChecksumSha256: rendered.result.checksumSha256,
        appliedImagePlacements:
          rendered.result.renderMetadata.rendererIntegrationOutput?.appliedImagePlacements ?? [],
        validation: rendered.result.renderMetadata.rendererIntegrationOutput?.validation ?? {
          errors: [],
          warnings: [],
          info: [],
        },
        requestFingerprint:
          rendered.result.renderMetadata.rendererIntegrationOutput?.requestFingerprint,
        pixelFingerprint:
          rendered.result.renderMetadata.rendererIntegrationOutput?.pixelFingerprint,
        renderFingerprint:
          rendered.result.renderMetadata.rendererIntegrationOutput?.renderFingerprint,
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(directory, "validation.json"), JSON.stringify(validation, null, 2));
  await writeFile(path.join(directory, "export.zip"), exported.zipBytes);
  return {
    status: "PASS",
    inputSha256: sha256(inputBytes),
    candidateId: (evidence.candidate as { candidateId: string }).candidateId,
    cropPixelRect: (evidence.candidate as { cropRect: unknown }).cropRect,
    renderSha256: rendered.result.checksumSha256,
    exportEmbeddedSha256: sha256(embeddedRenderBytes),
    warnings: rendered.result.warnings,
  };
}

async function main(): Promise<void> {
  if (process.env.OPENAI_PROVIDER_MODE !== "live") fail("OPENAI_PROVIDER_MODE_LIVE_REQUIRED");
  if (!process.env.OPENAI_API_KEY?.trim()) fail("OPENAI_API_KEY_REQUIRED");
  if (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL !== "gpt-5.6-luna")
    fail("OPENAI_MODEL_MUST_BE_GPT_5_6_LUNA");
  const { root: sampleRoot, zipSha256 } = await prepareSamples();
  const outputRoot = REVIEW_ROOT;
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const gateway = createOpenAIProviderGateway({ environment: process.env });
  const summaries: Record<string, unknown> = {};
  try {
    for (const [sampleKey, filename] of SAMPLES)
      summaries[sampleKey] = await runSample(sampleKey, filename, sampleRoot, gateway, outputRoot);
  } finally {
    await rm(sampleRoot, { recursive: true, force: true });
  }
  const summary = {
    gate: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E",
    status: "IMPLEMENTED_PENDING_USER_VISUAL_ACCEPTANCE",
    providerMode: "live",
    provider: "OpenAI",
    model: "gpt-5.6-luna",
    samplePackSha256: zipSha256,
    samples: summaries,
    userVisualAcceptance: "PENDING",
  };
  await writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(
    path.join(outputRoot, "README.md"),
    "# PI-2C Thumbnail Semantic Review Pack\n\nTechnical candidate output only. User visual acceptance remains PENDING.\n\nReview PRODUCT identity, clipping, crop composition, complex-scene interpretation, slot composition, text/template rendering, orientation, corruption, and blank output for all six samples.\n",
  );
  const files: { relativePath: string; bytesValue: Uint8Array }[] = [];
  async function collect(directory: string, prefix = ""): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await collect(absolute, relative);
      else
        files.push({
          relativePath: relative.replaceAll("\\", "/"),
          bytesValue: new Uint8Array(await readFile(absolute)),
        });
    }
  }
  await collect(outputRoot);
  for (const file of files) assertReviewJsonSafe(file.bytesValue, file.relativePath);
  const checksums = Object.fromEntries(
    files
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((file) => [file.relativePath, sha256(file.bytesValue)]),
  );
  await writeFile(path.join(outputRoot, "checksums.json"), JSON.stringify(checksums, null, 2));
  const finalFiles = [
    ...files,
    {
      relativePath: "checksums.json",
      bytesValue: new Uint8Array(await readFile(path.join(outputRoot, "checksums.json"))),
    },
  ];
  const pack = buildExportPackage({
    exportJobId: "PI-2C-Thumbnail-Semantic-Review-Pack",
    recipe: { id: "pi-2c-review-pack", includeManifest: false, includeValidationReport: false },
    items: finalFiles.map((file) => ({
      creativeVersionId: "review-pack",
      relativePath: file.relativePath,
      bytes: file.bytesValue,
    })),
  });
  const packPath = path.join(REVIEW_ROOT, REVIEW_PACK_NAME);
  await writeFile(packPath, pack.zipBytes);
  await writeFile(
    path.join(REVIEW_ROOT, "review-pack.sha256"),
    `${sha256(pack.zipBytes)}  ${REVIEW_PACK_NAME}\n`,
  );
  console.log(
    JSON.stringify(
      {
        status: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E_CANDIDATE_PASS",
        pending: "PENDING_USER_VISUAL_ACCEPTANCE",
        reviewPackPath: packPath,
        reviewPackSha256: sha256(pack.zipBytes),
      },
      null,
      2,
    ),
  );
}

if (process.env.VITEST) {
  describe("PI-2C live semantic placement Review Pack", () => {
    it("runs only with the approved live OpenAI provider and six supplied samples", async () => {
      await main();
    }, 300_000);
  });
} else {
  main().catch((error) => {
    console.error("PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E_BLOCKED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
