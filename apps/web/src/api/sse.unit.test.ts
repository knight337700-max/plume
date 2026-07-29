import { describe, expect, it, vi } from "vitest";
import { createWorkspaceEventSubscription, type WorkspaceEvent } from "./sse.js";
import { createJobEventsStore } from "../stores/job-events.js";

describe("workspace SSE subscription", () => {
  it("reconnects with the last received event id and updates the job store once", async () => {
    const requests: RequestInit[] = [];
    const events: WorkspaceEvent[] = [];
    const responses = [
      new Response(': heartbeat\nid: event-1\nevent: job.progressed\ndata: {"jobId":"job-1","status":"RUNNING","progressPercent":20}\n\n', { headers: { "Content-Type": "text/event-stream" } }),
      new Response('id: event-2\nevent: job.progressed\ndata: {"jobId":"job-1","status":"COMPLETED","progressPercent":100}\n\n', { headers: { "Content-Type": "text/event-stream" } }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      if (init) requests.push(init);
      const response = responses.shift();
      if (!response) throw new Error("No response fixture");
      return response;
    });
    const store = createJobEventsStore();
    const subscription = createWorkspaceEventSubscription({
      workspaceId: "ws-1", baseUrl: "/api/v1", fetcher,
      onEvent: (event) => { events.push(event); store.apply(event); },
    });
    await subscription.ready;
    await subscription.reconnect();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(requests[0]?.headers).get("Last-Event-ID")).toBeNull();
    expect(new Headers(requests[1]?.headers).get("Last-Event-ID")).toBe("event-1");
    expect(events).toHaveLength(2);
    expect(store.getJob("job-1")?.status).toBe("COMPLETED");
    expect(store.getSnapshot().lastEventId).toBe("event-2");
    expect(store.apply(events[1]!)).toBe(false);
    subscription.close();
  });
});
