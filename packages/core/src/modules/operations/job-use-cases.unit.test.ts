import { describe, expect, it } from "vitest";
import { createInMemoryJobQueryRepository, createJobUseCases } from "./job-use-cases.js";

const baseJob = { id: "job-1", workspaceId: "ws-1", status: "FAILED" as const, progressPercent: 50, attemptNo: 0, maxAttempts: 3 };
const items = [{ id: "item-1", jobId: "job-1", itemKey: "a", status: "COMPLETED" as const, progressPercent: 100 }, { id: "item-2", jobId: "job-1", itemKey: "b", status: "FAILED" as const, progressPercent: 30 }];

describe("job use cases", () => {
  it("allows retry only for failed jobs and preserves completed items", async () => {
    const repository = createInMemoryJobQueryRepository({ jobs: [baseJob], items });
    const useCases = createJobUseCases(repository);
    const retried = await useCases.retry("ws-1", "job-1");
    expect(retried).toMatchObject({ status: "QUEUED", attemptNo: 1 });
    expect(await useCases.listItems("ws-1", "job-1")).toEqual(expect.arrayContaining([expect.objectContaining({ id: "item-1", status: "COMPLETED" }), expect.objectContaining({ id: "item-2", status: "QUEUED" })]));
  });

  it("cancels active work without erasing completed item state", async () => {
    const repository = createInMemoryJobQueryRepository({ jobs: [{ ...baseJob, status: "RUNNING" }], items });
    const useCases = createJobUseCases(repository);
    expect((await useCases.cancel("ws-1", "job-1")).status).toBe("CANCELLED");
    expect(await useCases.listItems("ws-1", "job-1")).toEqual(expect.arrayContaining([expect.objectContaining({ id: "item-1", status: "COMPLETED" }), expect.objectContaining({ id: "item-2", status: "CANCELLED" })]));
  });
});
