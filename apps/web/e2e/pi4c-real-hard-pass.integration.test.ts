import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetTestDatabase } from "../../../packages/db/src/testing/reset.js";
import {
  createInMemoryCampaignRepositories,
  type CampaignRepositories,
} from "../../../packages/core/src/modules/campaign/repositories.js";
import { createInMemoryAssetRepositories } from "../../../packages/core/src/modules/asset/repositories.js";
import { createJacomoFixture, JACOMO_IDS } from "../../../packages/testkit/src/factories/jacomo-factory.js";
import { seedJacomoFixture } from "../../../packages/testkit/src/fixtures/jacomo.js";
import {
  startProcessHarness,
  type ProcessHarness,
} from "../../../packages/testkit/src/harness/process-harness.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL?.trim() ||
  "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const fixture = createJacomoFixture();
const timestamp = fixture.now;

function assetRepository() {
  return createInMemoryAssetRepositories({
    assets: fixture.products.map((product) => ({
      id: product.asset.id,
      workspaceId: fixture.workspace.id,
      brandId: fixture.brand.id,
      name: product.asset.name,
      assetType: "IMAGE",
      status: "ACTIVE" as const,
      currentVersionId: product.asset.versionId,
      licenseStatus: "VALID" as const,
      analysisSummaryJson: {},
      revisionNo: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    versions: fixture.products.map((product) => ({
      id: product.asset.versionId,
      workspaceId: fixture.workspace.id,
      designAssetId: product.asset.id,
      versionNo: 1,
      fileObjectId: product.asset.fileId,
      sourceType: "UPLOAD",
      analysisJson: { alpha: true },
      createdAt: timestamp,
    })),
  });
}

function campaignRepository(): CampaignRepositories {
  const repository = createInMemoryCampaignRepositories({
    campaigns: [
      {
        id: fixture.campaign.id,
        workspaceId: fixture.workspace.id,
        brandId: fixture.brand.id,
        displayCode: fixture.campaign.displayCode,
        name: fixture.campaign.name,
        objectiveCode: "SEASONAL_SALES",
        status: "DRAFT",
        currentStep: "READY",
        ownerUserId: fixture.owner.id,
        revisionNo: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    briefs: [
      {
        id: fixture.brief.id,
        workspaceId: fixture.workspace.id,
        campaignId: fixture.campaign.id,
        currentVersionId: fixture.brief.versionId,
        revisionNo: 1,
      },
    ],
    briefVersions: [
      {
        id: fixture.brief.versionId,
        workspaceId: fixture.workspace.id,
        campaignBriefId: fixture.brief.id,
        versionNo: 1,
        sourceKind: "UPLOAD",
        contentJson: { title: fixture.campaign.name },
        sourceCitationsJson: [],
        brandProfileSnapshotJson: { brand: fixture.brand.name },
        status: "CONFIRMED",
        createdBy: fixture.owner.id,
        confirmedAt: timestamp,
        createdAt: timestamp,
      },
    ],
    campaignProducts: fixture.products.map((product) => ({
      id: `${product.id.slice(0, -1)}1`,
      workspaceId: fixture.workspace.id,
      campaignId: fixture.campaign.id,
      productId: product.id,
      briefVersionId: fixture.brief.versionId,
      status: "CONFIRMED" as const,
      confirmedAt: timestamp,
      createdAt: timestamp,
    })),
    assetPoolSelections: fixture.products.map((product) => ({
      id: `${product.asset.id.slice(0, -1)}2`,
      workspaceId: fixture.workspace.id,
      campaignId: fixture.campaign.id,
      productId: product.id,
      assetVersionId: product.asset.versionId,
      roleCode: "PRODUCT",
      status: "SELECTED" as const,
      licenseStatus: "VALID",
      updatedAt: timestamp,
    })),
    channelSelections: [
      {
        id: JACOMO_IDS.channelSelection,
        workspaceId: fixture.workspace.id,
        campaignId: fixture.campaign.id,
        channelCode: "KAKAO_MOMENT",
        status: "SELECTED",
        snapshotJson: { versionId: "KAKAO_MOMENT" },
        updatedAt: timestamp,
      },
    ],
    formatSelections: [
      {
        id: JACOMO_IDS.formatSelection,
        workspaceId: fixture.workspace.id,
        campaignId: fixture.campaign.id,
        channelCode: "KAKAO_MOMENT",
        formatProfileId: "kakao-moment-bizboard-1029x258",
        profileVersion: "2026.1",
        status: "SELECTED",
        snapshotJson: { profileId: "kakao-moment-bizboard-1029x258" },
        updatedAt: timestamp,
      },
    ],
  });
  return {
    ...repository,
    // Keep the deterministic SQL binding while the real API validates the same selection.
    clearFormatSelections: async () => undefined,
  };
}

async function proxyApi(page: Page, harness: ProcessHarness, observed: string[]) {
  const apiBase = harness.services.api.url;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const source = new URL(request.url());
    observed.push(`${request.method()} ${source.pathname}${source.search}`);
    const response = await route.fetch({
      url: `${apiBase}${source.pathname}${source.search}`,
      headers: {
        ...request.headers(),
        "x-user-id": fixture.owner.id,
        "x-workspace-role": "OWNER",
      },
    });
    await route.fulfill({ response });
  });
}

describe("PI-4C real browser hard pass", () => {
  let harness: ProcessHarness;
  let vite: ViteDevServer;
  let browser: Browser;
  let baseUrl: string;

  beforeAll(async () => {
    await resetTestDatabase(databaseUrl);
    harness = await startProcessHarness({
      databaseUrl,
      durableProjectComposition: true,
      campaignRepositories: campaignRepository(),
      assetRepositories: assetRepository(),
      workerProviderMode: "mock",
    });
    await seedJacomoFixture(harness.database, fixture);
    await harness.database`UPDATE campaign_brief_version
      SET content_json = jsonb_build_object(
        'creativeCopy',
        jsonb_build_object(
          'advertiser', '자코모',
          'headline', '자코모 프리미엄 소파',
          'subcopy', '거실을 바꾸는 선택'
        )
      )
      WHERE id = ${fixture.brief.versionId}`;
    await harness.database`UPDATE campaign_asset
      SET role_code = 'PRODUCT'
      WHERE workspace_id = ${fixture.workspace.id}
        AND campaign_id = ${fixture.campaign.id}`;
    const selectedProduct = fixture.products.at(-1)!;
    const rendererAssetBytes = await readFile(
      path.resolve(
        "packages/renderer-vendor/upstream/fixtures/valid/object-right__product__basic__pass.png",
      ),
    );
    const rendererAssetChecksum = createHash("sha256")
      .update(rendererAssetBytes)
      .digest("hex");
    const rendererObjectKey = `workspaces/${fixture.workspace.id}/uploads/pi4c-product.png`;
    await harness.database`UPDATE file_object
      SET bytes = ${rendererAssetBytes.byteLength},
          checksum_sha256 = ${rendererAssetChecksum},
          object_key = ${rendererObjectKey}
      WHERE id = ${selectedProduct.asset.fileId}`;
    for (const product of fixture.products) {
      await harness.putObject(
        product.id === selectedProduct.id
          ? rendererObjectKey
          : `jacomo/assets/${product.internalCode}.png`,
        product.id === selectedProduct.id ? rendererAssetBytes : product.asset.bytes,
        "image/png",
      );
    }
    const storedRendererAsset = await harness.getObject(rendererObjectKey);
    expect(createHash("sha256").update(storedRendererAsset).digest("hex")).toBe(
      rendererAssetChecksum,
    );
    const webRoot = path.resolve("apps/web");
    vite = await createServer({
      root: webRoot,
      configFile: path.join(webRoot, "vite.config.ts"),
      server: { host: "127.0.0.1", port: 0 },
      logLevel: "error",
    });
    await vite.listen();
    baseUrl = vite.resolvedUrls?.local[0] ?? "";
    if (!baseUrl) throw new Error("PI4C_VITE_URL_MISSING");
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await vite?.close();
    await harness?.close();
  });

  it(
    "uses the real local API, PostgreSQL, Redis/BullMQ and renderer artifact",
    async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const observed: string[] = [];
      await proxyApi(page, harness, observed);
      try {
        const campaignProjects = `/w/${fixture.workspace.id}/campaigns/${fixture.campaign.id}/projects`;
        await page.goto(new URL(campaignProjects, baseUrl).toString());
        await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
        await page.getByRole("button", { name: "New Project" }).click();
        await page.getByLabel("Name").fill("PI-4C real browser Project");
        await page.getByLabel("Description (optional)").fill("Durable local hard-pass");
        await page.getByRole("button", { name: "Create Project" }).click();
        const projectRow = page.getByRole("row").filter({ hasText: "PI-4C real browser Project" });
        await projectRow.waitFor();
        const projectHref = await projectRow
          .getByRole("link", { name: /Open/ })
          .getAttribute("href");
        expect(projectHref).toBeTruthy();
        const projectId = new URL(projectHref!, "http://local").pathname.split("/").at(-1)!;

        await page.goto(new URL(`${projectHref}/assets`, baseUrl).toString());
        await page.getByRole("heading", { name: "Effective Asset Pool" }).waitFor();
        await page.getByText(/CAMPAIGN · Used by/).first().waitFor();

        await page.goto(
          new URL(`/w/${fixture.workspace.id}/ai-creative/setup`, baseUrl).toString(),
        );
        await page.getByLabel("Campaign").selectOption(fixture.campaign.id);
        await page.getByLabel("Project").selectOption(projectId);
        const selectedProduct = fixture.products.at(-1)!;
        await page.getByLabel("Product").selectOption(selectedProduct.id);
        await page.getByText("Setup is ready").waitFor();
        await page.getByRole("button", { name: "Continue to formats" }).click();

        const primaryFormat = page
          .getByRole("button", { name: /Kakao Moment Bizboard 1029x258/ })
          .first();
        await primaryFormat.waitFor();
        expect(await primaryFormat.isEnabled()).toBe(true);
        await primaryFormat.click();
        await page.getByRole("button", { name: "Review generation" }).click();
        await page.waitForURL(/formatSelectionIds=00000000-0000-4000-8000-00000000011d/);
        await page.getByRole("button", { name: "Start generation" }).click();
        await page.waitForURL(/jobId=/);
        const durableUrl = page.url();

        await page.reload();
        expect(page.url()).toBe(durableUrl);
        await page
          .getByText("Drafts are ready for human review")
          .waitFor({ timeout: 40_000 });
        await page.getByRole("button", { name: "Continue to editor" }).click();
        await page.getByRole("heading", { name: "Creative Editor" }).waitFor();
        await page.getByRole("img", { name: /Renderer preview/ }).waitFor();

        await page.goto(
          new URL(
            `/w/${fixture.workspace.id}/campaigns/${fixture.campaign.id}/projects/${projectId}/creatives`,
            baseUrl,
          ).toString(),
        );
        await page.getByRole("heading", { name: "Creative library" }).waitFor();
        await page.getByText("1 creatives").waitFor();
        await page.getByRole("link", { name: "Open editor" }).click();
        await page.getByRole("img", { name: /Renderer preview/ }).waitFor();

        const persisted = await harness.database<
          {
            project_id: string;
            creative_set_id: string;
            creative_id: string;
            current_version_id: string;
            version_id: string;
            snapshot: unknown;
          }[]
        >`SELECT gr.project_id, gr.creative_set_id, c.id AS creative_id,
            c.current_version_id, cv.id AS version_id, gr.asset_pool_snapshot_json AS snapshot
          FROM generation_request gr
          JOIN creative_set cs ON cs.id = gr.creative_set_id
          JOIN creative c ON c.creative_set_id = cs.id
          JOIN creative_version cv ON cv.id = c.current_version_id
          WHERE gr.project_id = ${projectId}
          ORDER BY gr.requested_at DESC LIMIT 1`;
        expect(persisted[0]).toMatchObject({
          project_id: projectId,
          current_version_id: persisted[0]?.version_id,
          snapshot: [
            expect.objectContaining({
              assetVersionId: selectedProduct.asset.versionId,
              source: "CAMPAIGN",
            }),
          ],
        });
        expect(observed).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/POST .*\/projects$/),
            expect.stringMatching(/GET .*\/assets\/effective$/),
            expect.stringMatching(/PUT .*\/format-selections$/),
            expect.stringMatching(/POST .*\/generation-requests$/),
            expect.stringMatching(/GET .*\/jobs\//),
            expect.stringMatching(/GET .*\/creative-sets$/),
            expect.stringMatching(/GET .*\/creative-versions\//),
          ]),
        );
      } finally {
        await page.close();
      }
    },
    60_000,
  );
});
