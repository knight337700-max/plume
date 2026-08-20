import { createHash } from "node:crypto";
import type { JacomoFixture } from "../factories/jacomo-factory.js";
import type { ProcessHarness } from "./process-harness.js";

export interface ProviderCallCounter {
  calls: number;
  models: string[];
  statuses: string[];
  evidence: unknown[];
}

export interface ThumbnailSemanticWorkflowResult {
  readonly label: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly productId: string;
  readonly productName: string;
  readonly assetId: string;
  readonly assetVersionId: string;
  readonly uploadId: string;
  readonly fileObject: Readonly<Record<string, unknown>>;
  readonly briefVersionId: string;
  readonly generationJobId: string;
  readonly creativeVersionId: string;
  readonly creativeVersion: Readonly<Record<string, unknown>>;
  readonly job: Readonly<Record<string, unknown>>;
  readonly jobItems: readonly Readonly<Record<string, unknown>>[];
  readonly commands: readonly string[];
  readonly renderResult: Readonly<Record<string, unknown>>;
  readonly validationResult: Readonly<Record<string, unknown>>;
  readonly exportResult: Readonly<Record<string, unknown>>;
  readonly semanticPlacement: Readonly<Record<string, unknown>>;
  readonly renderBytes: Uint8Array;
  readonly exportBytes: Uint8Array;
  readonly inputChecksumSha256: string;
  readonly renderChecksumSha256: string;
  readonly exportChecksumSha256: string;
  readonly exportEmbeddedPngChecksumSha256: string;
  readonly agentGenerateCalls: number;
  readonly agentRenderCalls: number;
  readonly productFlow: Readonly<Record<string, unknown>>;
}

interface JobItem {
  readonly command?: unknown;
  readonly status?: unknown;
  readonly messageId?: unknown;
  readonly result?: unknown;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}_OBJECT_REQUIRED`);
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label}_REQUIRED`);
  return value;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}_ARRAY_REQUIRED`);
  return value;
}

function sameBytes(actual: Uint8Array, expected: Uint8Array, label: string): void {
  if (
    actual.byteLength !== expected.byteLength ||
    !actual.every((byte, index) => byte === expected[index])
  )
    throw new Error(`${label}_BYTES_MISMATCH`);
}

async function getObjectWithRetry(
  harness: ProcessHarness,
  objectKey: string,
  timeoutMs = 5_000,
): Promise<Uint8Array> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await harness.getObject(objectKey);
    } catch (error) {
      lastError = error;
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? (error as { readonly statusCode?: unknown }).statusCode
          : undefined;
      if (statusCode !== 404) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OBJECT_STORAGE_READ_TIMEOUT");
}

async function jsonRequest(
  harness: ProcessHarness,
  path: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Readonly<Record<string, unknown>>> {
  const response = await harness.request(path, init);
  const body = response.status === 204 ? {} : ((await response.json()) as unknown);
  if (response.status !== expectedStatus)
    throw new Error(
      `${init.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status} ${JSON.stringify(body)}`,
    );
  return asRecord(body, `${init.method ?? "GET"}_${path}`);
}

async function waitForCompletedJob(
  harness: ProcessHarness,
  workspaceId: string,
  jobId: string,
  timeoutMs = 60_000,
): Promise<Readonly<Record<string, unknown>>> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const response = await harness.request(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`);
    const body = asRecord(await response.json(), "JOB_RESPONSE");
    if (response.status !== 200) throw new Error(`JOB_POLL_FAILED:${response.status}`);
    const job = asRecord(body.data, "JOB_DATA");
    lastStatus = String(job.status ?? "UNKNOWN");
    if (lastStatus === "COMPLETED") return job;
    if (["FAILED", "PARTIAL_SUCCESS", "CANCELLED"].includes(lastStatus)) {
      const itemsResponse = await harness.request(
        `/api/v1/workspaces/${workspaceId}/jobs/${jobId}/items`,
      );
      const items = itemsResponse.ok
        ? await itemsResponse.json()
        : { status: itemsResponse.status };
      throw new Error(`JOB_ENDED_${lastStatus}:${JSON.stringify({ job, items })}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`JOB_TIMEOUT:${lastStatus}`);
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
  throw new Error(`EXPORT_ENTRY_NOT_FOUND:${expectedName}`);
}

function safeJobItem(item: JobItem): Readonly<Record<string, unknown>> {
  const result = item.result === undefined ? undefined : asRecord(item.result, "JOB_ITEM_RESULT");
  const safeResult = result
    ? {
        ...(typeof result.status === "string" ? { status: result.status } : {}),
        ...(typeof result.creativeVersionId === "string"
          ? { creativeVersionId: result.creativeVersionId }
          : {}),
        ...(typeof result.objectKey === "string" ? { objectKey: result.objectKey } : {}),
        ...(typeof result.checksumSha256 === "string"
          ? { checksumSha256: result.checksumSha256 }
          : {}),
        ...(typeof result.renderMode === "string" ? { renderMode: result.renderMode } : {}),
        ...(typeof result.exportJobId === "string" ? { exportJobId: result.exportJobId } : {}),
        ...(Array.isArray(result.embeddedPngChecksums)
          ? { embeddedPngChecksums: result.embeddedPngChecksums }
          : {}),
        ...(result.validationReport && typeof result.validationReport === "object"
          ? { validationReport: result.validationReport }
          : {}),
      }
    : undefined;
  return {
    ...(typeof item.command === "string" ? { command: item.command } : {}),
    ...(typeof item.status === "string" ? { status: item.status } : {}),
    ...(typeof item.messageId === "string" ? { messageId: item.messageId } : {}),
    ...(safeResult ? { result: safeResult } : {}),
  };
}

export async function runThumbnailSemanticProductWorkflow(input: {
  readonly harness: ProcessHarness;
  readonly fixture: JacomoFixture;
  readonly bytes: Uint8Array;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly formatProfileId: string;
  readonly label: string;
  readonly productName?: string;
  readonly providerCalls: ProviderCallCounter;
}): Promise<ThumbnailSemanticWorkflowResult> {
  const { harness, fixture, bytes, mimeType, formatProfileId, label, providerCalls } = input;
  const headers = {
    "x-user-id": fixture.owner.id,
    "x-workspace-role": "OWNER",
    "content-type": "application/json",
  };
  const inputChecksumSha256 = sha256(bytes);
  const suffix = label.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  const productName = input.productName ?? `PI-2C.1 Product ${label}`;

  const campaignResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/campaigns`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        displayCode: `PI-2C1-${suffix}`,
        name: `PI-2C.1 ${label}`,
        objectiveCode: "SEASONAL_SALES",
        ownerUserId: fixture.owner.id,
      }),
    },
    201,
  );
  const campaign = asRecord(campaignResponse.data, "CAMPAIGN_DATA");
  const campaignId = requiredString(campaign.id, "CAMPAIGN_ID");

  const productResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/products`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: productName, internalCode: `PI-2C1-${suffix}` }),
    },
    201,
  );
  const product = asRecord(productResponse.data, "PRODUCT_DATA");
  const productId = requiredString(product.id, "PRODUCT_ID");

  const uploadResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/uploads`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        filename: `${suffix}.${mimeType === "image/jpeg" ? "jpg" : "png"}`,
        mimeType,
        bytes: bytes.byteLength,
        checksumSha256: inputChecksumSha256,
        purpose: "ASSET",
      }),
    },
    201,
  );
  const uploadId = requiredString(uploadResponse.id, "UPLOAD_ID");
  const uploadUrl = requiredString(uploadResponse.singleUploadUrl, "UPLOAD_URL");
  const uploadPut = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": mimeType },
    body: bytes,
  });
  if (!uploadPut.ok) throw new Error(`UPLOAD_PUT_FAILED:${uploadPut.status}`);
  const completion = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/uploads/${uploadId}.complete`,
    { method: "POST", headers, body: JSON.stringify({ checksumSha256: inputChecksumSha256 }) },
    200,
  );
  const fileObject = asRecord(completion.data, "FILE_OBJECT");
  const fileObjectId = requiredString(fileObject.id, "FILE_OBJECT_ID");
  const objectKey = requiredString(fileObject.objectKey, "FILE_OBJECT_KEY");
  if (fileObject.mimeType !== mimeType) throw new Error("FILE_OBJECT_MIME_MISMATCH");
  if (fileObject.bytes !== bytes.byteLength) throw new Error("FILE_OBJECT_BYTES_MISMATCH");
  if (fileObject.checksumSha256 !== inputChecksumSha256)
    throw new Error("FILE_OBJECT_CHECKSUM_MISMATCH");
  sameBytes(await getObjectWithRetry(harness, objectKey), bytes, "UPLOADED_OBJECT");

  const assetResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/assets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: `${productName} asset`,
        assetType: "IMAGE",
        licenseStatus: "VALID",
        analysisSummaryJson: { width: 1, height: 1, source: "PI_2C_1_API_E2E" },
      }),
    },
    201,
  );
  const asset = asRecord(assetResponse.data, "ASSET_DATA");
  const assetId = requiredString(asset.id, "ASSET_ID");
  const assetVersionResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/assets/${assetId}/versions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ fileObjectId, sourceType: "UPLOAD", analysisJson: { mimeType } }),
    },
    201,
  );
  const assetVersion = asRecord(assetVersionResponse.data, "ASSET_VERSION_DATA");
  const assetVersionId = requiredString(assetVersion.id, "ASSET_VERSION_ID");
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/products/${productId}/assets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ assetVersionId, isPrimary: true, sortOrder: 0 }),
    },
    201,
  );

  const briefResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/brief/versions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        sourceKind: "UPLOAD",
        contentJson: {
          creativeCopy: {
            advertiser: fixture.advertiser.name,
            headline: `${productName} 특별 기획`,
            subcopy: "실제 제품으로 확인하는 카카오모먼트 소재",
          },
          products: [productName],
        },
        createdBy: fixture.owner.id,
      }),
    },
    201,
  );
  const briefVersion = asRecord(briefResponse.data, "BRIEF_VERSION_DATA");
  const briefVersionId = requiredString(briefVersion.id, "BRIEF_VERSION_ID");
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/brief/versions/${briefVersionId}.confirm`,
    { method: "POST", headers, body: "{}" },
    200,
  );
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/products`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        briefVersionId,
        items: [{ productId, status: "CONFIRMED" }],
      }),
    },
    200,
  );
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/asset-pool`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        items: [{ productId, assetVersionId, status: "SELECTED", licenseStatus: "VALID" }],
      }),
    },
    200,
  );
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/channels`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ items: [{ channelCode: "KAKAO_MOMENT" }] }),
    },
    200,
  );
  await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/format-selections`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        items: [
          {
            channelCode: "KAKAO_MOMENT",
            formatProfileId,
          },
        ],
      }),
    },
    200,
  );

  const callsBeforeGeneration = providerCalls.calls;
  const generationResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/generation-requests`,
    {
      method: "POST",
      headers: {
        ...headers,
        "idempotency-key": `pi-2c1-${suffix}-${inputChecksumSha256.slice(0, 12)}`,
      },
      body: JSON.stringify({
        briefVersionId,
        productIds: [productId],
        formatSelectionIds: [formatProfileId],
        variantCountPerProduct: 1,
        generationMode: "CANONICAL_RENDERER",
      }),
    },
    202,
  );
  const generationJob = asRecord(generationResponse.job, "GENERATION_JOB");
  const generationJobId = requiredString(generationJob.id, "GENERATION_JOB_ID");
  if (generationJob.status !== "QUEUED") throw new Error("GENERATION_JOB_NOT_QUEUED");
  const job = await waitForCompletedJob(harness, fixture.workspace.id, generationJobId);
  const callsAfterGeneration = providerCalls.calls;
  const itemsResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJobId}/items`,
    {},
    200,
  );
  const items = requiredArray(itemsResponse.items, "JOB_ITEMS") as JobItem[];
  if (items.length !== 4) throw new Error(`JOB_ITEMS_COUNT:${items.length}`);
  if (!items.every((item) => item.status === "COMPLETED"))
    throw new Error("JOB_ITEM_NOT_COMPLETED");
  const commands = items.map((item) => requiredString(item.command, "JOB_ITEM_COMMAND"));
  const rootItem = items.find((item) => item.command === "creative.generate");
  const renderItem = items.find((item) => item.command === "creative.render");
  const validationItem = items.find((item) => item.command === "validation.run");
  const exportItem = items.find((item) => item.command === "export.render_and_package");
  if (!rootItem || !renderItem || !validationItem || !exportItem)
    throw new Error("REQUIRED_JOB_ITEMS_MISSING");
  const rootResult = asRecord(rootItem.result, "GENERATE_RESULT");
  const creativeVersionIds = requiredArray(rootResult.creativeVersionIds, "CREATIVE_VERSION_IDS");
  const creativeVersionId = requiredString(creativeVersionIds[0], "CREATIVE_VERSION_ID");
  const creativeVersionResponse = await jsonRequest(
    harness,
    `/api/v1/workspaces/${fixture.workspace.id}/creative-versions/${creativeVersionId}`,
    {},
    200,
  );
  const creativeVersion = asRecord(creativeVersionResponse.data, "CREATIVE_VERSION");
  const document = asRecord(creativeVersion.documentJson, "CREATIVE_DOCUMENT");
  const metadata = asRecord(document.metadata, "CREATIVE_METADATA");
  const semanticPlacement = asRecord(metadata.semanticPlacement, "SEMANTIC_PLACEMENT");
  const serializedDocument = JSON.stringify(document);
  if (/data:image\/|base64|OPENAI_API_KEY|Authorization|Bearer\s/iu.test(serializedDocument))
    throw new Error("CREATIVE_DOCUMENT_SECRET_OR_RAW_IMAGE");

  const renderResult = asRecord(renderItem.result, "RENDER_RESULT");
  const renderer = asRecord(renderResult.renderer, "RENDERER_RESULT");
  if (renderResult.status !== "COMPLETED") throw new Error("RENDER_RESULT_NOT_COMPLETED");
  if (renderResult.renderMode !== "CANONICAL_RENDERER") throw new Error("RENDER_MODE_MISMATCH");
  if (renderResult.width !== 1029 || renderResult.height !== 258)
    throw new Error("RENDER_DIMENSIONS_MISMATCH");
  if (renderResult.mimeType !== "image/png" || renderResult.rgba !== true)
    throw new Error("RENDER_OUTPUT_CONTRACT_MISMATCH");
  if (renderer.commit !== "7baa272dd852ed21a09cf369c928571b3f75fd31")
    throw new Error("RENDERER_SHA_MISMATCH");
  if (renderer.integrationContract !== "1.8.0") throw new Error("RENDERER_CONTRACT_MISMATCH");
  const rendererValidation = asRecord(renderer.validation, "RENDERER_VALIDATION");
  if (requiredArray(rendererValidation.errors, "RENDERER_ERRORS").length !== 0)
    throw new Error("RENDERER_VALIDATION_ERRORS");
  const placements = requiredArray(renderer.appliedImagePlacements, "APPLIED_PLACEMENTS");
  if (placements.length < 1) throw new Error("APPLIED_PLACEMENT_MISSING");
  const placement = asRecord(placements[0], "APPLIED_PLACEMENT");
  if (placement.imageSlotId !== "IMAGE_PRIMARY") throw new Error("PLACEMENT_SLOT_MISMATCH");
  if (placement.policy !== "SEMANTIC_CROP_COVER") throw new Error("PLACEMENT_POLICY_MISMATCH");
  if (placement.changedFromRequestedPlan !== false) throw new Error("PLACEMENT_PLAN_CHANGED");
  const candidate = asRecord(semanticPlacement.candidate, "SEMANTIC_CANDIDATE");
  const acceptedPlan = asRecord(semanticPlacement.acceptedPlan, "SEMANTIC_ACCEPTED_PLAN");
  if (candidate.candidateId !== acceptedPlan.cropCandidateId)
    throw new Error("SEMANTIC_CANDIDATE_PLAN_MISMATCH");
  if (placement.cropCandidateId !== candidate.candidateId)
    throw new Error("RENDER_CANDIDATE_REFERENCE_MISMATCH");

  const validationResult = asRecord(validationItem.result, "VALIDATION_RESULT");
  if (!["PASS", "WARNING"].includes(String(validationResult.status)))
    throw new Error("VALIDATION_JOB_NOT_PASS");
  const validationReport = asRecord(validationResult.validationReport, "VALIDATION_REPORT");
  if (validationReport.errorCount !== 0) throw new Error("VALIDATION_ERRORS");

  const exportResult = asRecord(exportItem.result, "EXPORT_RESULT");
  if (exportResult.status !== "COMPLETED") throw new Error("EXPORT_RESULT_NOT_COMPLETED");
  const renderObjectKey = requiredString(renderResult.objectKey, "RENDER_OBJECT_KEY");
  const exportObjectKey = requiredString(exportResult.objectKey, "EXPORT_OBJECT_KEY");
  const renderBytes = await getObjectWithRetry(harness, renderObjectKey);
  const exportBytes = await getObjectWithRetry(harness, exportObjectKey);
  const renderChecksumSha256 = sha256(renderBytes);
  const exportChecksumSha256 = sha256(exportBytes);
  if (renderChecksumSha256 !== renderResult.checksumSha256)
    throw new Error("RENDER_OBJECT_CHECKSUM_MISMATCH");
  const embeddedRenderBytes = storedZipEntry(exportBytes, "render.png");
  const exportEmbeddedPngChecksumSha256 = sha256(embeddedRenderBytes);
  if (exportEmbeddedPngChecksumSha256 !== renderChecksumSha256)
    throw new Error("EXPORT_RENDER_IDENTITY_MISMATCH");
  const embeddedChecksums = requiredArray(
    exportResult.embeddedPngChecksums,
    "EXPORT_EMBEDDED_CHECKSUMS",
  );
  if (embeddedChecksums[0] !== renderChecksumSha256)
    throw new Error("EXPORT_MANIFEST_RENDER_CHECKSUM_MISMATCH");
  const agentGenerateCalls = callsAfterGeneration - callsBeforeGeneration;
  if (agentGenerateCalls !== 1) throw new Error(`AGENT_GENERATE_CALLS:${agentGenerateCalls}`);
  const callsAfterWorkflow = providerCalls.calls;
  const agentRenderCalls = callsAfterWorkflow - callsAfterGeneration;
  if (agentRenderCalls !== 0) throw new Error(`AGENT_RENDER_CALLS:${agentRenderCalls}`);

  const productFlow = Object.freeze({
    uploadId,
    fileObject,
    fileObjectId,
    objectKey,
    assetId,
    assetVersionId,
    productId,
    briefVersionId,
    generationJobId,
    jobStatus: job.status,
    jobItemsCount: items.length,
    jobItems: items.map(safeJobItem),
    commands,
    creativeVersionId,
    renderObjectKey,
    renderObjectSha256: renderChecksumSha256,
    exportObjectKey,
    exportObjectSha256: exportChecksumSha256,
    validationStatus: validationResult.status,
    exportEmbeddedPngChecksumSha256,
  });
  return {
    label,
    workspaceId: fixture.workspace.id,
    campaignId,
    productId,
    productName,
    assetId,
    assetVersionId,
    uploadId,
    fileObject,
    briefVersionId,
    generationJobId,
    creativeVersionId,
    creativeVersion,
    job,
    jobItems: items.map(safeJobItem),
    commands,
    renderResult,
    validationResult,
    exportResult,
    semanticPlacement,
    renderBytes,
    exportBytes,
    inputChecksumSha256,
    renderChecksumSha256,
    exportChecksumSha256,
    exportEmbeddedPngChecksumSha256,
    agentGenerateCalls,
    agentRenderCalls,
    productFlow,
  };
}
