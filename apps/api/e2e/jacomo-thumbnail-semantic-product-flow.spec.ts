import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentProviderGateway } from "../../../packages/core/src/agents/orchestrator.js";
import { createInMemoryClientBrandRepositories } from "../../../packages/core/src/modules/client-brand/repositories.js";
import { createJacomoFixture } from "../../../packages/testkit/src/factories/jacomo-factory.js";
import { seedJacomoFixture } from "../../../packages/testkit/src/fixtures/jacomo.js";
import {
  runThumbnailSemanticProductWorkflow,
  type ProviderCallCounter,
} from "../../../packages/testkit/src/harness/thumbnail-semantic-product-flow.js";
import { startProcessHarness } from "../../../packages/testkit/src/harness/process-harness.js";
import { PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID } from "../../../packages/infrastructure/src/render/renderer-bindings.js";

const fixtureRoot = path.join(process.cwd(), "packages/renderer-vendor/upstream/fixtures/valid");
const roleHeaders = (userId: string) => ({
  "x-user-id": userId,
  "x-workspace-role": "OWNER",
  "content-type": "application/json",
});

function countingFakeGateway(counter: ProviderCallCounter): AgentProviderGateway {
  return {
    async execute() {
      counter.calls += 1;
      counter.models.push("fake-gpt-5.6-luna");
      counter.statuses.push("COMPLETED");
      counter.evidence.push({ status: "PASS", source: "PI_2C_1_CI_FAKE" });
      return {
        status: "COMPLETED",
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
          rationale: "CI fake gateway identifies the selected Product subject",
        },
      };
    },
  };
}

async function validImage(filename: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtureRoot, filename)));
}

async function createHarness(
  fixture: ReturnType<typeof createJacomoFixture>,
  counter: ProviderCallCounter,
) {
  const clientBrandRepositories = createInMemoryClientBrandRepositories({
    advertisers: [
      {
        id: fixture.advertiser.id,
        workspaceId: fixture.workspace.id,
        name: fixture.advertiser.name,
        normalizedName: fixture.advertiser.name,
        status: "ACTIVE",
        ownerUserId: fixture.owner.id,
        revisionNo: 1,
      },
    ],
    brands: [
      {
        id: fixture.brand.id,
        workspaceId: fixture.workspace.id,
        advertiserId: fixture.advertiser.id,
        name: fixture.brand.name,
        normalizedName: fixture.brand.name,
        status: "ACTIVE",
        revisionNo: 1,
      },
    ],
  });
  const harness = await startProcessHarness({
    workerProviderGateway: countingFakeGateway(counter),
    workerProviderMode: "mock",
    clientBrandRepositories,
  });
  await seedJacomoFixture(harness.database, fixture);
  return harness;
}

describe("PI-2C.1 actual Thumbnail Product Workflow E2E", () => {
  it.each([
    ["PNG", "thumbnail-box-right__asset__basic__pass.png", "image/png"],
    ["JPEG", "thumbnail-box-right__asset__jpeg__pass.jpg", "image/jpeg"],
  ] as const)(
    "runs the real process-harness API workflow for %s",
    async (_label, filename, mimeType) => {
      const fixture = createJacomoFixture();
      const counter: ProviderCallCounter = { calls: 0, models: [], statuses: [], evidence: [] };
      const harness = await createHarness(fixture, counter);
      try {
        const result = await runThumbnailSemanticProductWorkflow({
          harness,
          fixture,
          bytes: await validImage(filename),
          mimeType,
          formatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
          label: _label,
          providerCalls: counter,
        });
        expect(result.fileObject).toMatchObject({
          id: expect.any(String),
          objectKey: expect.any(String),
          mimeType,
          bytes: expect.any(Number),
          checksumSha256: result.inputChecksumSha256,
        });
        expect(result.job.status).toBe("COMPLETED");
        expect(result.jobItems).toHaveLength(4);
        expect(result.commands).toEqual([
          "creative.generate",
          "creative.render",
          "validation.run",
          "export.render_and_package",
        ]);
        expect(result.jobItems.every((item) => item.status === "COMPLETED")).toBe(true);
        expect(result.creativeVersion.documentJson).toMatchObject({
          metadata: {
            renderMode: "CANONICAL_RENDERER",
            semanticPlacement: {
              schemaVersion: "1.0.0",
              gate: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E",
            },
          },
        });
        const serializedDocument = JSON.stringify(result.creativeVersion.documentJson);
        const forbiddenSecretMarkers = [
          "data:image/",
          "base64",
          ["OPENAI", "API", "KEY"].join("_"),
          "Authorization",
          "Bearer ",
        ];
        expect(forbiddenSecretMarkers.some((marker) => serializedDocument.includes(marker))).toBe(
          false,
        );
        expect(result.renderResult).toMatchObject({
          status: "COMPLETED",
          renderMode: "CANONICAL_RENDERER",
          width: 1029,
          height: 258,
          mimeType: "image/png",
          rgba: true,
          renderer: {
            commit: "7baa272dd852ed21a09cf369c928571b3f75fd31",
            integrationContract: "1.8.0",
            validation: { errors: [] },
          },
        });
        expect(result.renderResult.renderer).toMatchObject({
          appliedImagePlacements: [
            expect.objectContaining({
              imageSlotId: "IMAGE_PRIMARY",
              policy: "SEMANTIC_CROP_COVER",
              changedFromRequestedPlan: false,
              cropCandidateId: result.semanticPlacement.candidate
                ? (result.semanticPlacement.candidate as { candidateId: string }).candidateId
                : undefined,
            }),
          ],
        });
        expect(result.validationResult).toMatchObject({
          status: expect.stringMatching(/^(PASS|WARNING)$/u),
          validationReport: { errorCount: 0 },
        });
        expect(result.exportResult.status).toBe("COMPLETED");
        expect(result.exportEmbeddedPngChecksumSha256).toBe(result.renderChecksumSha256);
        expect(result.agentGenerateCalls).toBe(1);
        expect(result.agentRenderCalls).toBe(0);
        expect(counter.calls).toBe(1);
      } finally {
        await harness.close();
      }
    },
    120_000,
  );

  it("rejects a format selection that is not registered by the actual API catalog", async () => {
    const fixture = createJacomoFixture();
    const counter: ProviderCallCounter = { calls: 0, models: [], statuses: [], evidence: [] };
    const harness = await createHarness(fixture, counter);
    try {
      const headers = roleHeaders(fixture.owner.id);
      const campaignResponse = await harness.request(
        `/api/v1/workspaces/${fixture.workspace.id}/brands/${fixture.brand.id}/campaigns`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            displayCode: "PI-2C1-NEGATIVE",
            name: "PI-2C.1 negative format selection",
            objectiveCode: "SEASONAL_SALES",
            ownerUserId: fixture.owner.id,
          }),
        },
      );
      expect(campaignResponse.status).toBe(201);
      const campaignBody = (await campaignResponse.json()) as { data: { id: string } };
      const response = await harness.request(
        `/api/v1/workspaces/${fixture.workspace.id}/campaigns/${campaignBody.data.id}/format-selections`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            items: [
              {
                channelCode: "KAKAO_MOMENT",
                formatProfileId: "kakao-moment-thumbnail-not-registered",
              },
            ],
          }),
        },
      );
      expect(response.status).toBe(422);
      expect(((await response.json()) as { readonly code?: string }).code).toBe(
        "FORMAT_PROFILE_CHANNEL_MISMATCH",
      );
      expect(counter.calls).toBe(0);
    } finally {
      await harness.close();
    }
  }, 120_000);

  it("fails closed when the uploaded Product MIME declaration disagrees with the image bytes", async () => {
    const fixture = createJacomoFixture();
    const counter: ProviderCallCounter = { calls: 0, models: [], statuses: [], evidence: [] };
    const harness = await createHarness(fixture, counter);
    try {
      await expect(
        runThumbnailSemanticProductWorkflow({
          harness,
          fixture,
          bytes: await validImage("thumbnail-box-right__asset__jpeg__pass.jpg"),
          mimeType: "image/png",
          formatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
          label: "DECLARED_PNG_ACTUAL_JPEG",
          providerCalls: counter,
        }),
      ).rejects.toThrow("MIME_MAGIC_MISMATCH");
      expect(counter.calls).toBe(0);
    } finally {
      await harness.close();
    }
  }, 120_000);
});
