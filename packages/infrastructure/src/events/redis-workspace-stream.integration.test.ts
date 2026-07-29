import { describe, expect, it } from "vitest";
import { createInMemoryWorkspaceEventStream, WORKSPACE_EVENT_TYPES } from "./redis-workspace-stream.js";

const jobProgress = { jobId: "job-1", status: "RUNNING", progressPercent: 20, currentStep: "render" };

describe("workspace event stream", () => {
  it("projects all 13 event types with monotonic IDs and replays after Last-Event-ID", async () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const stream = createInMemoryWorkspaceEventStream({ clock: () => now });
    const first = await stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: jobProgress });
    const second = await stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: { ...jobProgress, progressPercent: 40 } });
    expect(WORKSPACE_EVENT_TYPES).toHaveLength(13);
    expect(Number(second.id.slice(4))).toBeGreaterThan(Number(first.id.slice(4)));
    expect(await stream.read("ws-1", first.id)).toEqual([second]);
    expect(await stream.read("ws-2")).toHaveLength(0);
  });

  it("bounds replay retention and validates the event envelope", async () => {
    let now = new Date("2026-07-29T12:00:00.000Z");
    const stream = createInMemoryWorkspaceEventStream({ clock: () => now });
    await expect(stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: { jobId: "missing" } })).rejects.toThrow(/progressPercent/);
    await stream.append({ workspaceId: "ws-1", event: "job.progressed", payload: jobProgress, occurredAt: "2026-07-28T11:59:59.000Z" });
    now = new Date("2026-07-29T12:00:01.000Z");
    expect(await stream.read("ws-1")).toHaveLength(0);
  });
});

