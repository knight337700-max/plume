import { describe, expect, it } from "vitest";
import { createInMemoryCampaignRepositories } from "../campaign/repositories.js";
import { createInMemoryAssetRepositories } from "../asset/repositories.js";
import { createInMemoryCreativeRepositories } from "../creative/repositories.js";
import { createGenerationUseCases } from "../campaign/generation-use-cases.js";
import { createInMemoryProjectRepositories } from "./repositories.js";
import { createProjectUseCases } from "./project-use-cases.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const brandId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const assetId = "55555555-5555-4555-8555-555555555555";
const assetVersionId = "66666666-6666-4666-8666-666666666666";
const briefId = "77777777-7777-4777-8777-777777777777";
const briefVersionId = "88888888-8888-4888-8888-888888888888";
const at = "2026-08-27T00:00:00.000Z";

function fixture() {
  const campaigns = createInMemoryCampaignRepositories({
    campaigns: [
      {
        id: campaignId,
        workspaceId,
        brandId,
        displayCode: "C1",
        name: "Campaign",
        objectiveCode: "AWARENESS",
        status: "ACTIVE",
        currentStep: "ASSETS",
        revisionNo: 1,
        createdAt: at,
        updatedAt: at,
      },
    ],
    campaignProducts: [
      {
        id: productId,
        workspaceId,
        campaignId,
        productId,
        briefVersionId,
        status: "CONFIRMED",
        confirmedAt: at,
        createdAt: at,
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
        sourceKind: "HUMAN",
        contentJson: {},
        sourceCitationsJson: [],
        brandProfileSnapshotJson: {},
        status: "CONFIRMED",
        confirmedAt: at,
        createdAt: at,
      },
    ],
    assetPoolSelections: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        workspaceId,
        campaignId,
        productId,
        assetVersionId,
        roleCode: "PRODUCT",
        status: "SELECTED",
        licenseStatus: "VALID",
        updatedAt: at,
      },
    ],
  });
  const assets = createInMemoryAssetRepositories({
    assets: [
      {
        id: assetId,
        workspaceId,
        brandId,
        name: "Packshot",
        assetType: "IMAGE",
        status: "ACTIVE",
        currentVersionId: assetVersionId,
        licenseStatus: "VALID",
        analysisSummaryJson: {},
        revisionNo: 1,
        createdAt: at,
        updatedAt: at,
      },
    ],
    versions: [
      {
        id: assetVersionId,
        workspaceId,
        designAssetId: assetId,
        versionNo: 1,
        fileObjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sourceType: "UPLOAD",
        analysisJson: {},
        createdAt: at,
      },
    ],
  });
  const projectRepositories = createInMemoryProjectRepositories();
  const projects = createProjectUseCases({ projects: projectRepositories, campaigns, assets });
  return { campaigns, assets, projectRepositories, projects };
}

describe("PI-4C0 Project and asset contracts", () => {
  it("supports CRUD, optimistic concurrency, campaign ownership, and archive", async () => {
    const { projects } = fixture();
    const created = await projects.create({ workspaceId, campaignId, name: "Launch" });
    expect((await projects.list(workspaceId, campaignId)).map((x) => x.id)).toEqual([created.id]);
    const updated = await projects.update(workspaceId, created.id, { name: "Launch 2" }, 1);
    expect(updated.revisionNo).toBe(2);
    await expect(
      projects.update(workspaceId, created.id, { name: "stale" }, 1),
    ).rejects.toMatchObject({ code: "REVISION_MISMATCH" });
    await expect(
      projects.get("00000000-0000-4000-8000-000000000000", created.id),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await projects.archive(workspaceId, created.id, 2);
    expect(await projects.list(workspaceId, campaignId)).toEqual([]);
  });

  it("inherits live campaign assets, validates local refs, and de-duplicates BOTH", async () => {
    const { projects } = fixture();
    const project = await projects.create({ workspaceId, campaignId, name: "Launch" });
    await projects.addAsset({
      workspaceId,
      projectId: project.id,
      assetVersionId,
      productId,
      roleCode: "PRODUCT",
    });
    expect(await projects.effectiveAssets(workspaceId, project.id)).toMatchObject([
      {
        assetVersionId,
        productId,
        roleCode: "PRODUCT",
        source: "BOTH",
        sources: ["CAMPAIGN", "PROJECT"],
        inherited: true,
        projectMutable: true,
        eligible: true,
      },
    ]);
    await expect(
      projects.addAsset({
        workspaceId,
        projectId: project.id,
        assetVersionId,
        productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roleCode: "PRODUCT",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_PRODUCT_SCOPE_MISMATCH" });
  });

  it("freezes an immutable generation snapshot and propagates projectId to CreativeSet", async () => {
    const { campaigns, projects } = fixture();
    const project = await projects.create({ workspaceId, campaignId, name: "Launch" });
    const creatives = createInMemoryCreativeRepositories();
    const generation = createGenerationUseCases(campaigns, { projects, creatives });
    const result = await generation.create({
      workspaceId,
      campaignId,
      projectId: project.id,
      products: [{ productId }],
      formatProfileIds: ["format-1"],
    });
    expect(result.request.projectId).toBe(project.id);
    expect(result.request.assetPoolSnapshotJson).toHaveLength(1);
    expect(
      (await creatives.listCreativeSetsByProject(workspaceId, project.id))[0]?.generationRequestId,
    ).toBe(result.request.id);
    await projects.removeAsset(
      workspaceId,
      project.id,
      (
        await projects.addAsset({
          workspaceId,
          projectId: project.id,
          assetVersionId,
          productId,
          roleCode: "LOGO",
        })
      ).id,
    );
    expect(result.request.assetPoolSnapshotJson).toHaveLength(1);
  });
});
