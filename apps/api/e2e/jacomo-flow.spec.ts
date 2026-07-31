import { describe, it } from "vitest";
import { createJacomoFixture } from "../../../packages/testkit/src/factories/jacomo-factory.js";
import { seedJacomoFixture } from "../../../packages/testkit/src/fixtures/jacomo.js";
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

async function waitForCompletedJob(
  harness: ProcessHarness,
  workspaceId: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 20_000;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const response = await harness.request(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`);
    const body = (await response.json()) as { data?: Record<string, unknown> };
    if (response.status !== 200) throw new Error(`job polling failed: ${response.status}`);
    const job = body.data ?? {};
    lastStatus = String(job.status ?? "UNKNOWN");
    if (lastStatus === "COMPLETED") return job;
    if (["FAILED", "PARTIAL_SUCCESS", "CANCELLED"].includes(lastStatus)) {
      throw new Error(`JACOMO job ended in ${lastStatus}: ${JSON.stringify(job)}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`JACOMO job did not complete; last status=${lastStatus}`);
}

async function runJacomoFlow(): Promise<void> {
  const fixture = createJacomoFixture();
  const harness = await startProcessHarness();
  try {
    await seedJacomoFixture(harness.database, fixture);
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
    const generationJob = (generationResponse.job ?? {}) as { id?: string; status?: string };
    expect(typeof generationJob.id === "string", "generation must return a durable job id");
    expect(generationJob.status === "QUEUED", "generation must be queued before worker delivery");
    const job = await waitForCompletedJob(harness, fixture.workspace.id, generationJob.id);
    const itemsResponse = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}/items`,
      {},
      200,
    );
    const items = (itemsResponse.items ?? []) as Array<{ command?: string; status?: string; messageId?: string; result?: Record<string, unknown> }>;
    const commands = items.map((item) => item.command);
    expect(items.length === 8, "JACOMO must persist one root, three render, three validation, and one export item");
    expect(commands.filter((command) => command === "creative.generate").length === 1, "root command item missing");
    expect(commands.filter((command) => command === "creative.render").length === 3, "render worker item count mismatch");
    expect(commands.filter((command) => command === "validation.run").length === 3, "validation worker item count mismatch");
    expect(commands.filter((command) => command === "export.render_and_package").length === 1, "export worker item missing");
    expect(items.every((item) => item.status === "COMPLETED"), "every queued JACOMO item must complete");
    const renderItems = items.filter((item) => item.command === "creative.render");
    for (const item of renderItems) {
      const objectKey = item.result?.objectKey;
      expect(typeof objectKey === "string", "render result must contain a durable object key");
      const bytes = await harness.getObject(objectKey);
      expect(bytes.byteLength > 100, "render artifact must be non-empty");
      expect(Array.from(bytes.subarray(0, 8)).join(",") === "137,80,78,71,13,10,26,10", "render artifact must be PNG");
    }
    const exportItem = items.find((item) => item.command === "export.render_and_package");
    const exportObjectKey = exportItem?.result?.objectKey;
    expect(typeof exportObjectKey === "string", "export result must contain a durable object key");
    const packageBytes = await harness.getObject(exportObjectKey);
    expect(packageBytes[0] === 0x50 && packageBytes[1] === 0x4b, "export artifact must be a ZIP");
    const replay = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}`,
      {},
      200,
    );
    const replayData = replay.data as { status?: string } | undefined;
    expect(replayData?.status === "COMPLETED", "durable job status must remain completed after delivery");
    const rootItem = items.find((item) => item.command === "creative.generate");
    expect(typeof rootItem?.messageId === "string", "root command message id must be durable");
    await harness.replayMessage(rootItem.messageId);
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const replayItems = await jsonRequest(
      harness,
      `/api/v1/workspaces/${fixture.workspace.id}/jobs/${generationJob.id}/items`,
      {},
      200,
    );
    expect(
      (replayItems.items as Array<{ status?: string }>).every((item) => item.status === "COMPLETED"),
      "duplicate command delivery must be absorbed by the idempotency guard",
    );
    expect(await harness.exerciseDeadLetter(), "exhausted worker delivery must be recorded in dead-letter queue");
    const sse = await harness.request(`/api/v1/workspaces/${fixture.workspace.id}/events/stream`, {
      headers: { accept: "text/event-stream", "last-event-id": "evt_0000000000000000" },
    });
    expect(sse.ok && (await sse.text()).includes("heartbeat"), "SSE endpoint must be available");
    console.log(
      JSON.stringify(
        {
          status: "PASS",
          services: Object.keys(harness.services),
          campaignId: campaign.id,
          jobId: generationJob.id,
          items: items.length,
          exportBytes: packageBytes.byteLength,
          statusFromApi: job.status,
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
