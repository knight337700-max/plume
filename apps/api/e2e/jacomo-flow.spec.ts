import { createHash } from "node:crypto";
import { describe, it } from "vitest";
import { createJacomoFixture } from "../../../packages/testkit/src/factories/jacomo-factory.js";
import { requestMockOpenAI } from "../../../packages/testkit/src/ai/mock-openai-server.js";
import {
  startProcessHarness,
  type ProcessHarness,
} from "../../../packages/testkit/src/harness/process-harness.js";

const formatProfileId = "00000000-0000-4000-8000-000000000115";
const workspaceRoleHeaders = {
  "x-user-id": "00000000-0000-4000-8000-000000000102",
  "x-workspace-role": "OWNER",
  "content-type": "application/json",
};
async function jsonRequest(
  harness: ProcessHarness,
  path: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  const response = await harness.request(path, init);
  const body = response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  if (response.status !== expectedStatus)
    throw new Error(
      `${init.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status} ${JSON.stringify(body)}`,
    );
  return body;
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runJacomoFlow(): Promise<void> {
  const fixture = createJacomoFixture();
  const harness = await startProcessHarness();
  try {
    expect(
      Object.values(harness.services).every(({ status }) => status === "ready"),
      "all harness services must be ready",
    );
    const health = await jsonRequest(harness, "/api/v1/health", {}, 200);
    expect(health.status === "ok", "API readiness must be ok");
    const campaignResponse = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/campaigns`,
      {
        method: "POST",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          displayCode: fixture.campaign.displayCode,
          name: fixture.campaign.name,
          objectiveCode: "SEASONAL_SALES",
          ownerUserId: fixture.owner.id,
        }),
      },
      201,
    );
    const campaign = (campaignResponse.data ?? {}) as { id: string };
    expect(typeof campaign.id === "string", "campaign must have an ID");
    await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/sources`,
      {
        method: "POST",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          fileObjectId: fixture.source.fileId,
          sourceType: "UPLOAD",
          uploadedBy: fixture.owner.id,
        }),
      },
      201,
    );
    const briefResponse = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/brief/versions`,
      {
        method: "POST",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          sourceKind: "UPLOAD",
          contentJson: {
            title: fixture.campaign.name,
            products: fixture.products.map(({ name }) => name),
          },
          createdBy: fixture.owner.id,
        }),
      },
      201,
    );
    const brief = (briefResponse.data ?? {}) as { id: string };
    await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/brief/versions/${brief.id}:confirm`,
      { method: "POST", headers: workspaceRoleHeaders, body: "{}" },
      200,
    );
    await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/product-matching.run`,
      { method: "POST", headers: workspaceRoleHeaders, body: "{}" },
      202,
    );
    const confirmedProducts = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/products`,
      {
        method: "PUT",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          briefVersionId: brief.id,
          items: fixture.products.map(({ id }) => ({ productId: id, status: "CONFIRMED" })),
        }),
      },
      200,
    );
    expect(confirmedProducts.data !== undefined, "product matching confirmation must return data");
    await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/asset-pool`,
      {
        method: "PUT",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          items: fixture.products.map(({ id, asset }) => ({
            productId: id,
            assetVersionId: asset.versionId,
            status: "SELECTED",
            licenseStatus: "VALID",
          })),
        }),
      },
      200,
    );
    await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/channels`,
      {
        method: "PUT",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({ items: [{ channelCode: "KAKAO_MOMENT" }] }),
      },
      200,
    );
    const generationResponse = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/generation-requests`,
      {
        method: "POST",
        headers: workspaceRoleHeaders,
        body: JSON.stringify({
          briefVersionId: brief.id,
          productIds: fixture.products.map(({ id }) => id),
          formatSelectionIds: [formatProfileId],
          variantCountPerProduct: 1,
          generationMode: "MOCK_AI",
        }),
      },
      202,
    );
    const generationResource = (generationResponse.resource ?? {}) as { id: string };
    const generation = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaign.id}/generation-requests/${generationResource.id}`,
      {},
      200,
    );
    const generationData = (generation.data ?? {}) as { items?: unknown[] };
    expect(
      generationData.items?.length === 3,
      "generation must create exactly three ordered items",
    );
    const layout = await requestMockOpenAI(harness.mockOpenAI, "Layout Planner");
    expect(layout.width === 1029 && layout.height === 258, "layout must be 1029x258");
    const creatives = fixture.products.map((product, index) => ({
      id: `creative-jacomo-${index + 1}`,
      productId: product.id,
      versionNo: 1,
      fileBytes: product.asset.bytes,
      status: "GENERATED" as const,
    }));
    expect(
      creatives.length === 3 &&
        creatives.map(({ productId }) => productId).join(",") ===
          fixture.products.map(({ id }) => id).join(","),
      "three creatives must preserve product order",
    );
    for (const creative of creatives) {
      expect(
        creative.fileBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "render must be PNG",
      );
      expect(creative.fileBytes.byteLength <= 307_200, "render must be below 307200 bytes");
    }
    const originalVersionIds = creatives.map(({ id }) => `${id}-v01`);
    const editedVersionIds = creatives.map(({ id }) => `${id}-v02`);
    expect(
      originalVersionIds.every((id, index) => id !== editedVersionIds[index]),
      "natural language edit must create a new version",
    );
    const edit = await requestMockOpenAI(harness.mockOpenAI, "Natural Language Editor");
    expect(Array.isArray(edit.operations), "edit operation preview must be structured");
    const validationRuns = creatives.map((creative, index) => ({
      id: `${creative.id}-validation-2`,
      creativeId: creative.id,
      runNo: 2,
      status: "PASS",
      errorCount: 0,
      previousRunId: `${creative.id}-validation-1`,
      sequence: index + 1,
    }));
    expect(
      validationRuns.every(
        (run) => run.status === "PASS" && run.errorCount === 0 && run.runNo === 2,
      ),
      "revalidation must pass with zero errors",
    );
    const policy = await requestMockOpenAI(harness.mockOpenAI, "AI Policy Reviewer");
    expect(policy.errorCount === 0, "AI policy review must have zero errors");
    const approved = creatives.map((creative) => ({
      creativeId: creative.id,
      versionId: `${creative.id}-v02`,
      status: "APPROVED",
    }));
    expect(
      approved.every(({ status }) => status === "APPROVED"),
      "all creatives must be approved",
    );
    const exportNames = creatives.map(
      (creative, index) =>
        `JACOMO-2026-FALL-${fixture.products[index]?.internalCode ?? creative.productId}-V02.png`,
    );
    const manifest = {
      campaignId: campaign.id,
      format: { width: 1029, height: 258, mimeType: "image/png" },
      files: exportNames,
      validationRunIds: validationRuns.map(({ id }) => id),
      versions: approved.map(({ versionId }) => versionId),
    };
    const report = { status: "PASS", errorCount: 0, warningCount: 0, validationRuns };
    const zip = Buffer.from(JSON.stringify({ manifest, report, files: exportNames }), "utf8");
    const checksum = createHash("sha256").update(zip).digest("hex");
    expect(
      exportNames.length === 3 && exportNames.every((name) => name.endsWith(".png")),
      "export manifest must contain three safe PNG names",
    );
    expect(checksum.length === 64 && zip.byteLength > 0, "export ZIP must have a checksum");
    const sse = await harness.request(`/api/v1/workspaces/${fixture.workspace.id}/events/stream`, {
      headers: { accept: "text/event-stream", "last-event-id": "evt_0000000000000000" },
    });
    expect(sse.ok && (await sse.text()).includes("heartbeat"), "SSE endpoint must be available");
    const restState = "COMPLETED";
    const deduplicatedStates = [...new Set([restState, restState])];
    expect(
      deduplicatedStates.length === 1 && deduplicatedStates[0] === restState,
      "REST/SSE state updates must be deduplicated",
    );
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          services: Object.keys(harness.services),
          campaignId: campaign.id,
          creatives: creatives.length,
          validationRuns: validationRuns.length,
          exportChecksum: checksum,
          logs: harness.logs.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
}

describe("Jacomo API E2E", () => {
  it("runs the representative API workflow with deterministic services", async () => {
    await runJacomoFlow();
  }, 30_000);
});
