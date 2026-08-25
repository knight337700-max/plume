import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDeterministicZip } from "../../../packages/infrastructure/src/export/build-package.js";
import { createJacomoFixture } from "../../../packages/testkit/src/factories/jacomo-factory.js";
import { seedJacomoFixture } from "../../../packages/testkit/src/fixtures/jacomo.js";
import { startProcessHarness, type ProcessHarness } from "../../../packages/testkit/src/harness/process-harness.js";

const formatProfileId = "kakao-moment-bizboard-1029x258";
const workspaceRoleHeaders = {
  "x-user-id": "00000000-0000-4000-8000-000000000102",
  "x-workspace-role": "OWNER",
  "content-type": "application/json",
};

async function jsonRequest(
  harness: ProcessHarness,
  pathName: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  const response = await harness.request(pathName, init);
  const body = response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  expect(response.status, `${init.method ?? "GET"} ${pathName}: ${JSON.stringify(body)}`).toBe(expectedStatus);
  return body;
}

async function waitForCompletedJob(
  harness: ProcessHarness,
  workspaceId: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 30_000;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const response = await harness.request(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`);
    const body = (await response.json()) as { data?: Record<string, unknown> };
    expect(response.status).toBe(200);
    const job = body.data ?? {};
    lastStatus = String(job.status ?? "UNKNOWN");
    if (lastStatus === "COMPLETED") return job;
    if (["FAILED", "PARTIAL_SUCCESS", "CANCELLED"].includes(lastStatus)) {
      const itemsResponse = await harness.request(
        `/api/v1/workspaces/${workspaceId}/jobs/${jobId}/items`,
      );
      const items = itemsResponse.ok ? await itemsResponse.json() : { status: itemsResponse.status };
      throw new Error(
        `Canonical job ended in ${lastStatus}: ${JSON.stringify({ job, items })}`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Canonical job did not complete; last status=${lastStatus}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function zipContains(bytes: Uint8Array, needle: Uint8Array): boolean {
  if (needle.byteLength === 0) return true;
  outer: for (let offset = 0; offset <= bytes.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1)
      if (bytes[offset + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

describe("PI-1B canonical Kakao Product E2E", () => {
  it("uploads a Product, renders it with confirmed copy, validates, exports, and replays idempotently", async () => {
    const fixture = createJacomoFixture();
    const harness = await startProcessHarness();
    let reviewRoot: string | undefined;
    try {
      await seedJacomoFixture(harness.database, fixture);
      const bytes = new Uint8Array(
        await readFile(
          path.join(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../packages/renderer-vendor/upstream/fixtures/valid/object-right__product__basic__pass.png",
          ),
        ),
      );
      const inputChecksum = sha256(bytes);

      const campaignResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/campaigns`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({
            displayCode: "JACOMO-PI-1B",
            name: "PI-1B Real Kakao Product",
            objectiveCode: "SEASONAL_SALES",
            ownerUserId: fixture.owner.id,
          }),
        },
        201,
      );
      const campaignId = String((campaignResponse.data as { id: string }).id);

      const upload = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/uploads`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({
            filename: "pi-1b-product.png",
            mimeType: "image/png",
            bytes: bytes.byteLength,
            checksumSha256: inputChecksum,
            purpose: "ASSET",
          }),
        },
        201,
      );
      const uploadUrl = String(upload.singleUploadUrl);
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: bytes,
      });
      expect(uploadResponse.ok).toBe(true);
      const fileResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/uploads/${String(upload.id)}.complete`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ checksumSha256: inputChecksum }),
        },
        200,
      );
      const fileObject = fileResponse.data as {
        id: string;
        objectKey: string;
        mimeType: string;
        bytes: number;
        checksumSha256: string;
      };
      expect(fileObject.mimeType).toBe("image/png");
      expect(fileObject.bytes).toBe(bytes.byteLength);
      expect(fileObject.checksumSha256).toBe(inputChecksum);
      expect(await harness.getObject(fileObject.objectKey)).toEqual(bytes);

      const assetResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/assets`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ name: "PI-1B uploaded product", assetType: "IMAGE", licenseStatus: "VALID" }),
        },
        201,
      );
      const assetId = String((assetResponse.data as { id: string }).id);
      const assetVersionResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/assets/${assetId}/versions`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ fileObjectId: fileObject.id, sourceType: "UPLOAD", createdBy: fixture.owner.id }),
        },
        201,
      );
      const assetVersionId = String((assetVersionResponse.data as { id: string; fileObjectId: string }).id);
      expect((assetVersionResponse.data as { fileObjectId: string }).fileObjectId).toBe(fileObject.id);
      const productId = fixture.products[0]!.id;
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/products/${productId}/assets`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ assetVersionId, isPrimary: true, sortOrder: 0 }),
        },
        201,
      );

      const briefResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/brief/versions`,
        {
          method: "POST",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({
            sourceKind: "MANUAL",
            contentJson: {
              creativeCopy: {
                advertiser: "자코모",
                headline: "자코모 프리미엄 소파",
                subcopy: "거실을 바꾸는 선택",
              },
            },
            createdBy: fixture.owner.id,
          }),
        },
        201,
      );
      const briefVersionId = String((briefResponse.data as { id: string }).id);
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/brief/versions/${briefVersionId}.confirm`,
        { method: "POST", headers: workspaceRoleHeaders, body: "{}" },
        200,
      );
      const confirmedBriefResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/brief`,
        {},
        200,
      );
      expect(
        (confirmedBriefResponse.data as { version?: { id?: string; status?: string } }).version,
      ).toMatchObject({ id: briefVersionId, status: "CONFIRMED" });
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/products`,
        {
          method: "PUT",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ briefVersionId, items: [{ productId, status: "CONFIRMED" }] }),
        },
        200,
      );
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/asset-pool`,
        {
          method: "PUT",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ items: [{ productId, assetVersionId, status: "SELECTED", licenseStatus: "VALID" }] }),
        },
        200,
      );
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/channels`,
        {
          method: "PUT",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ items: [{ channelCode: "KAKAO_MOMENT" }] }),
        },
        200,
      );
      await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/format-selections`,
        {
          method: "PUT",
          headers: workspaceRoleHeaders,
          body: JSON.stringify({ items: [{ channelCode: "KAKAO_MOMENT", formatProfileId }] }),
        },
        200,
      );

      const generationResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignId}/generation-requests`,
        {
          method: "POST",
          headers: {
            ...workspaceRoleHeaders,
            "idempotency-key": `pi-1b-canonical-generation-${campaignId}`,
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
      const generationJob = (generationResponse.job ?? {}) as { id: string; status: string };
      expect(generationJob.status).toBe("QUEUED");
      const job = await waitForCompletedJob(harness, fixture.workspace.id, generationJob.id);
      expect(job.status).toBe("COMPLETED");
      expect(harness.mockOpenAI.requests).toHaveLength(0);

      const itemsResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}/items`,
        {},
        200,
      );
      const items = (itemsResponse.items ?? []) as Array<{ command?: string; status?: string; messageId?: string; result?: Record<string, unknown> }>;
      expect(items).toHaveLength(4);
      expect(items.every((item) => item.status === "COMPLETED")).toBe(true);
      const rootItem = items.find((item) => item.command === "creative.generate")!;
      const renderItem = items.find((item) => item.command === "creative.render")!;
      const validationItem = items.find((item) => item.command === "validation.run")!;
      const exportItem = items.find((item) => item.command === "export.render_and_package")!;
      const renderResult = renderItem.result!;
      expect(renderResult.renderMode).toBe("CANONICAL_RENDERER");
      expect(renderResult.legacyFallbackUsed).toBe(false);
      expect((renderResult.renderer as Record<string, unknown>).commit).toBe("7baa272dd852ed21a09cf369c928571b3f75fd31");
      expect((renderResult.renderer as Record<string, unknown>).integrationContract).toBe("1.8.0");
      expect(renderResult.width).toBe(1029);
      expect(renderResult.height).toBe(258);
      expect(renderResult.mimeType).toBe("image/png");
      expect(renderResult.rgba).toBe(true);
      expect(renderResult.checksumSha256).toBe(
        "20dc9d62b8650a72115a8d584846399d9cd6dd2c8a0996b4889edb596feb68b1",
      );
      const renderer = renderResult.renderer as Record<string, unknown>;
      const placement = (renderer.appliedImagePlacements as Array<Record<string, unknown>>)[0];
      expect(placement).toBeDefined();
      if (!placement) throw new Error("CANONICAL_PLACEMENT_EVIDENCE_MISSING");
      expect(placement.imageSlotId).toBe("OBJECT_RIGHT_PRODUCT");
      expect(placement.destinationRect).toBeDefined();
      expect(placement.alphaTrimApplied).toBe(true);
      expect(renderer.pixelFingerprint).toBe(
        "f6690a069d861caeb90770d3f8e9304c7bba749177eda83c4222668e6f066836",
      );
      expect(renderer.renderFingerprint).toBe(renderer.pixelFingerprint);
      expect((renderer.canonicalRequest as Record<string, unknown>).headline).toBe("자코모 프리미엄 소파");
      expect((renderer.canonicalRequest as Record<string, unknown>).subcopy).toBe("거실을 바꾸는 선택");
      expect(["PASS", "WARNING"]).toContain(validationItem.result?.status);
      const validationReport = validationItem.result?.validationReport as Record<string, unknown>;
      expect(validationReport.rendererValidation).toBeDefined();
      expect(validationReport.errorCount).toBe(0);

      const creativeVersionId = String((rootItem.result?.creativeVersionIds as string[])[0]);
      const creativeVersionResponse = await jsonRequest(
        harness,
        `/api/v1/workspaces/${fixture.workspace.id}/creative-versions/${creativeVersionId}`,
        {},
        200,
      );
      const document = (creativeVersionResponse.data as { documentJson: Record<string, unknown>; copyAssetsJson: Record<string, unknown> });
      expect((document.documentJson.metadata as Record<string, unknown>).renderMode).toBe("CANONICAL_RENDERER");
      expect(document.copyAssetsJson).toEqual({ advertiser: "자코모", headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" });
      expect(document.documentJson.usedAssetVersionIds).toEqual([assetVersionId]);
      expect(JSON.stringify(document.documentJson)).not.toContain("MOCK AI CREATIVE");

      const renderObjectKey = String(renderResult.objectKey);
      const renderBytes = await harness.getObject(renderObjectKey);
      const renderChecksum = sha256(renderBytes);
      expect(renderChecksum).toBe(String(renderResult.checksumSha256));
      const exportObjectKey = String(exportItem.result?.objectKey);
      const exportBytes = await harness.getObject(exportObjectKey);
      expect(exportBytes[0]).toBe(0x50);
      expect(exportBytes[1]).toBe(0x4b);
      expect(zipContains(exportBytes, renderBytes)).toBe(true);
      expect((exportItem.result?.embeddedPngChecksums as string[])[0]).toBe(renderChecksum);

      if (rootItem.messageId) {
        await harness.replayMessage(rootItem.messageId);
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        const replayItemsResponse = await jsonRequest(
          harness,
          `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}/items`,
          {},
          200,
        );
        const replayItems = (replayItemsResponse.items ?? []) as Array<{ command?: string; status?: string }>;
        expect(replayItems).toHaveLength(4);
        expect(replayItems.every((item) => item.status === "COMPLETED")).toBe(true);
      }

      reviewRoot = await mkdtemp(path.join(os.tmpdir(), "plume-pi-1b-review-"));
      const reviewDir = path.join(reviewRoot, "PI-1B-Kakao-Review-Pack-files");
      const reviewZip = path.join(reviewRoot, "PI-1B-Kakao-Review-Pack.zip");
      const evidence = {
        workspace: fixture.workspace.id,
        creativeVersionId,
        assetVersionId,
        inputChecksum: inputChecksum,
        renderChecksum,
        exportEmbeddedPngChecksum: (exportItem.result?.embeddedPngChecksums as string[])[0],
        rendererSha: renderer.commit,
        contractVersion: renderer.integrationContract,
        requestFingerprint: renderer.requestFingerprint,
        pixelFingerprint: renderer.pixelFingerprint,
        renderFingerprint: renderer.renderFingerprint,
        appliedImagePlacement: placement,
        validation: validationItem.result?.validationReport,
      };
      await mkdir(reviewDir, { recursive: true });
      await writeFile(path.join(reviewDir, "01-input-product.png"), bytes);
      await writeFile(path.join(reviewDir, "02-canonical-render.png"), renderBytes);
      await writeFile(path.join(reviewDir, "03-export-package.zip"), exportBytes);
      await writeFile(path.join(reviewDir, "04-evidence.json"), JSON.stringify(evidence, null, 2));
      const reviewPack = createDeterministicZip([
        { relativePath: "01-input-product.png", bytesValue: bytes },
        { relativePath: "02-canonical-render.png", bytesValue: renderBytes },
        { relativePath: "03-export-package.zip", bytesValue: exportBytes },
        { relativePath: "04-evidence.json", bytesValue: new TextEncoder().encode(JSON.stringify(evidence, null, 2)) },
      ]);
      await writeFile(reviewZip, reviewPack);
      expect((await harness.request(`/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}`)).status).toBe(200);
    } finally {
      try {
        await harness.close();
      } finally {
        if (reviewRoot) await rm(reviewRoot, { recursive: true, force: true });
      }
    }
  }, 60_000);
});
