import { describe, expect, it, vi } from "vitest";
import { createInMemoryExportRepositories } from "../../../../../packages/core/src/modules/export/repositories.js";
import { createExportWorkerHandler, type ExportWorkerInput } from "./build-export.js";

const eligibility = { creativeVersionId: "v1", currentCreativeVersionId: "v1", approval: { status: "APPROVED", creativeVersionId: "v1", validationRunId: "run-1" }, validationRun: { id: "run-1", creativeVersionId: "v1", status: "PASS", summaryJson: { errorCount: 0, warningCount: 0 } }, formatProfile: { status: "ACTIVE", exportable: true }, exportRecipe: { id: "recipe-1", status: "ACTIVE" }, asOf: "2026-07-29T00:00:00.000Z" } as const;

async function fixture() {
  const repositories = createInMemoryExportRepositories();
  const job = await repositories.createJob({ id: "job-1", workspaceId: "ws-1", campaignId: "campaign-1", exportRecipeId: "recipe-1", requestedBy: "user-1" });
  const first = await repositories.createItem({ id: "item-1", workspaceId: "ws-1", exportJobId: job.id, creativeVersionId: "v1", approvalRequestId: "approval-1", validationRunId: "run-1", sortOrder: 1 });
  const second = await repositories.createItem({ id: "item-2", workspaceId: "ws-1", exportJobId: job.id, creativeVersionId: "v2", approvalRequestId: "approval-2", validationRunId: "run-2", sortOrder: 2 });
  return { repositories, job, first, second };
}

describe("export worker", () => {
  it("persists completed item files and reuses a successful render on ZIP retry", async () => {
    const { repositories, job, first } = await fixture();
    const render = vi.fn(async () => ({ bytes: Uint8Array.from([1, 2, 3]), checksumSha256: "render-hash-1" }));
    const handler = createExportWorkerHandler({ repositories });
    const input: ExportWorkerInput = { workspaceId: "ws-1", jobId: job.id, packageInput: { recipe: { id: "recipe-1", includeManifest: true, includeValidationReport: true } }, items: [{ recordId: first.id, creativeVersionId: "v1", relativePath: "KAKAO/v1.png", eligibility, render }] };
    const firstInputItem = input.items[0];
    if (!firstInputItem) throw new Error("fixture item missing");
    const firstRun = await handler(input);
    expect(firstRun.status).toBe("COMPLETED");
    expect(render).toHaveBeenCalledTimes(1);
    const secondRun = await handler({ ...input, items: [{ ...firstInputItem, rendered: { bytes: Uint8Array.from([1, 2, 3]), checksumSha256: "render-hash-1" }, render }] });
    expect(secondRun.status).toBe("COMPLETED");
    expect(render).toHaveBeenCalledTimes(1);
    expect(await repositories.listFiles("ws-1", job.id)).toEqual(expect.arrayContaining([expect.objectContaining({ fileRole: "PACKAGE" })]));
  });

  it("supports partial success but fails atomically when the complete package is required", async () => {
    const { repositories, job, first, second } = await fixture();
    const handler = createExportWorkerHandler({ repositories });
    const failedEligibility = { ...eligibility, creativeVersionId: "v2", currentCreativeVersionId: "v2", approval: { ...eligibility.approval, creativeVersionId: "old-v2" } };
    const input: ExportWorkerInput = { workspaceId: "ws-1", jobId: job.id, packageInput: { recipe: { id: "recipe-1", includeManifest: true, includeValidationReport: true } }, items: [{ recordId: first.id, creativeVersionId: "v1", relativePath: "a.png", eligibility, rendered: { bytes: Uint8Array.from([1]) } }, { recordId: second.id, creativeVersionId: "v2", relativePath: "b.png", eligibility: failedEligibility, rendered: { bytes: Uint8Array.from([2]) } }] };
    const [firstInputItem, secondInputItem] = input.items;
    if (!firstInputItem || !secondInputItem) throw new Error("fixture items missing");
    const partial = await handler(input);
    expect(partial.status).toBe("PARTIAL_SUCCESS");
    expect(await repositories.listFiles("ws-1", job.id)).toEqual(expect.arrayContaining([expect.objectContaining({ fileRole: "PACKAGE" })]));

    const { repositories: atomicRepos, job: atomicJob, first: atomicFirst, second: atomicSecond } = await fixture();
    const atomic = createExportWorkerHandler({ repositories: atomicRepos });
    const atomicResult = await atomic({ ...input, jobId: atomicJob.id, items: [{ ...firstInputItem, recordId: atomicFirst.id }, { ...secondInputItem, recordId: atomicSecond.id }], requireCompletePackage: true });
    expect(atomicResult.status).toBe("FAILED");
    expect(await atomicRepos.listFiles("ws-1", atomicJob.id)).toHaveLength(0);
  });
});
