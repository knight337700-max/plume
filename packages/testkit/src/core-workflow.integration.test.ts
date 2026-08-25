import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAssetUseCases,
  createDeterministicUploadStorage,
  createInMemoryAssetRepositories,
  createUploadUseCases,
} from "@plume/core/src/modules/asset/public.js";
import {
  createCampaignAssetPoolUseCases,
  createCampaignSourceUseCases,
  createBriefUseCases,
  createGenerationUseCases,
  createInMemoryCampaignRepositories,
  createMediaSelectionUseCases,
  createProductMatchingUseCases,
} from "@plume/core/src/modules/campaign/public.js";
import { createCanonicalCatalogRepository } from "@plume/core/src/modules/media-catalog/public.js";

describe("core workflow integration", () => {
  it("runs upload -> asset version -> brief -> matching -> selection -> generation", async () => {
    const body = new TextEncoder().encode("creative-file");
    const uploads = createUploadUseCases({
      storage: createDeterministicUploadStorage(),
      bucket: "private",
    });
    const upload = await uploads.create({
      workspaceId: "ws-1",
      filename: "creative.png",
      mimeType: "image/png",
      bytes: body.byteLength,
      purpose: "ASSET",
    });
    const file = await uploads.complete({
      workspaceId: "ws-1",
      uploadId: upload.id,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
    });
    const assets = createAssetUseCases(createInMemoryAssetRepositories());
    const asset = await assets.create({
      workspaceId: "ws-1",
      brandId: "brand-1",
      name: "Hero",
      assetType: "IMAGE",
      licenseStatus: "VALID",
    });
    const assetVersion = await assets.createVersion({
      workspaceId: "ws-1",
      assetId: asset.id,
      fileObjectId: file.id,
      sourceType: "UPLOAD",
    });
    const repositories = createInMemoryCampaignRepositories();
    const campaign = await repositories.createCampaign({
      workspaceId: "ws-1",
      brandId: "brand-1",
      displayCode: "C-001",
      name: "Launch",
      objectiveCode: "SALES",
      currentStep: "SOURCES",
    });
    const sources = createCampaignSourceUseCases({
      repositories,
      files: { getFile: (workspaceId, fileObjectId) => uploads.getFile(workspaceId, fileObjectId) },
    });
    await sources.attach({
      workspaceId: "ws-1",
      campaignId: campaign.id,
      fileObjectId: file.id,
      sourceType: "UPLOAD",
    });
    const briefs = createBriefUseCases(repositories);
    const brief = await briefs.createVersion({
      workspaceId: "ws-1",
      campaignBriefId: campaign.id,
      sourceKind: "MANUAL",
      contentJson: { objective: "sales" },
    });
    await briefs.confirm("ws-1", brief.id);
    const matching = createProductMatchingUseCases(repositories);
    await matching.run("ws-1", campaign.id, brief.id, [
      { productId: "p1", score: 0.9 },
      { productId: "p2", score: 0.8 },
      { productId: "p3", score: 0.7 },
    ]);
    await matching.confirm("ws-1", campaign.id, brief.id, [
      { productId: "p1", status: "CONFIRMED" },
      { productId: "p2", status: "CONFIRMED" },
      { productId: "p3", status: "CONFIRMED" },
    ]);
    const pool = createCampaignAssetPoolUseCases(repositories);
    await pool.select({
      workspaceId: "ws-1",
      campaignId: campaign.id,
      productId: "p1",
      assetVersionId: assetVersion.id,
      status: "SELECTED",
      licenseStatus: "VALID",
    });
    const catalog = createMediaSelectionUseCases(createCanonicalCatalogRepository());
    const selection = await catalog.validate({
      channels: [{ channelCode: "KAKAO_MOMENT" }],
      formats: [],
    });
    expect(selection.channels[0]?.versionId).toBe("KAKAO_MOMENT");
    const generation = createGenerationUseCases(repositories);
    const aggregate = await generation.create({
      workspaceId: "ws-1",
      campaignId: campaign.id,
      briefVersionId: brief.id,
      products: [{ productId: "p1" }, { productId: "p2" }, { productId: "p3" }],
      formatProfileIds: ["kakao-bizboard-v1"],
    });
    expect(aggregate.items).toHaveLength(3);
    expect(aggregate.request.estimatedItemCount).toBe(3);
  });
});
