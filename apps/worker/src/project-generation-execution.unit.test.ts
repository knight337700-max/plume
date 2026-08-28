import { describe, expect, it } from "vitest";
import { createInMemoryCampaignRepositories } from "../../../packages/core/src/modules/campaign/repositories.js";
import {
  createSnapshotAwareCampaignRepositories,
  runProjectGenerationExecutionContext,
} from "./project-generation-execution.js";

const workspaceId = "00000000-0000-4000-8000-000000000401";
const campaignId = "00000000-0000-4000-8000-000000000402";
const productA = "00000000-0000-4000-8000-000000000403";
const productB = "00000000-0000-4000-8000-000000000404";

function snapshot(assetVersionId: string, productId: string) {
  return [{ assetVersionId, productId, roleCode: "PRODUCT", source: "PROJECT" as const }];
}

describe("Project generation non-Frozen snapshot execution", () => {
  it("projects only the immutable per-job Product snapshot and never calls the live delegate", async () => {
    const live = createInMemoryCampaignRepositories({
      campaigns: [
        {
          id: campaignId,
          workspaceId,
          brandId: "brand",
          displayCode: "SNAPSHOT",
          name: "Snapshot test",
          objectiveCode: "SALES",
          status: "DRAFT",
          currentStep: "READY",
          revisionNo: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      assetPoolSelections: [
        {
          id: "live",
          workspaceId,
          campaignId,
          productId: productA,
          assetVersionId: "live-version",
          status: "SELECTED",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    let liveReads = 0;
    const delegate = {
      ...live,
      async listAssetPoolSelections(...args: Parameters<typeof live.listAssetPoolSelections>) {
        liveReads += 1;
        return live.listAssetPoolSelections(...args);
      },
    };
    const repositories = createSnapshotAwareCampaignRepositories(delegate);

    const result = await runProjectGenerationExecutionContext(
      {
        workspaceId,
        campaignId,
        projectId: "00000000-0000-4000-8000-000000000405",
        jobId: "00000000-0000-4000-8000-000000000406",
        assetPoolSnapshot: snapshot("snapshot-version", productA),
      },
      () => repositories.listAssetPoolSelections(workspaceId, campaignId, productA),
    );

    expect(result).toMatchObject([{ assetVersionId: "snapshot-version", roleCode: "PRODUCT" }]);
    expect(liveReads).toBe(0);
    await expect(
      repositories.listAssetPoolSelections(workspaceId, campaignId, productA),
    ).resolves.toMatchObject([{ assetVersionId: "live-version" }]);
    expect(liveReads).toBe(1);
  });

  it("isolates concurrent jobs and fails closed for missing or ambiguous Product snapshots", async () => {
    const repositories = createSnapshotAwareCampaignRepositories(
      createInMemoryCampaignRepositories(),
    );
    const first = runProjectGenerationExecutionContext(
      {
        workspaceId,
        campaignId,
        projectId: "project-a",
        jobId: "job-a",
        assetPoolSnapshot: snapshot("asset-a", productA),
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return repositories.listAssetPoolSelections(workspaceId, campaignId, productA);
      },
    );
    const second = runProjectGenerationExecutionContext(
      {
        workspaceId,
        campaignId,
        projectId: "project-b",
        jobId: "job-b",
        assetPoolSnapshot: snapshot("asset-b", productB),
      },
      () => repositories.listAssetPoolSelections(workspaceId, campaignId, productB),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([
      [expect.objectContaining({ assetVersionId: "asset-a" })],
      [expect.objectContaining({ assetVersionId: "asset-b" })],
    ]);
    await expect(
      runProjectGenerationExecutionContext(
        { workspaceId, campaignId, projectId: "project-c", jobId: "job-c", assetPoolSnapshot: [] },
        () => repositories.listAssetPoolSelections(workspaceId, campaignId, productA),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_SNAPSHOT_PRODUCT_ASSET_REQUIRED" });
    await expect(
      runProjectGenerationExecutionContext(
        {
          workspaceId,
          campaignId,
          projectId: "project-d",
          jobId: "job-d",
          assetPoolSnapshot: [...snapshot("asset-a", productA), ...snapshot("asset-b", productA)],
        },
        () => repositories.listAssetPoolSelections(workspaceId, campaignId, productA),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_SNAPSHOT_PRODUCT_ASSET_AMBIGUOUS" });
  });
});
