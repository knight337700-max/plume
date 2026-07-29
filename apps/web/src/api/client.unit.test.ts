import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./client.js";
import { queryKeys } from "./query-keys.js";

describe("web API client", () => {
  it("normalizes Problem Details while preserving field errors and request id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        type: "about:blank", title: "Request Failed", status: 422,
        code: "VALIDATION_ERROR_OPEN", detail: "The request contains invalid fields.",
        requestId: "req-1", errors: [{ path: "/name", message: "Required", code: "REQUIRED" }],
      }), { status: 422, headers: { "Content-Type": "application/problem+json" } }),
    );
    const client = createApiClient({ baseUrl: "https://api.example.test/api/v1", fetcher });
    const error = await client.get("/campaigns").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.code).toBe("VALIDATION_ERROR_OPEN");
    expect((error as ApiError).problem.errors).toEqual([
      { path: "/name", message: "Required", code: "REQUIRED" },
    ]);
    expect((error as ApiError).problem.requestId).toBe("req-1");
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.example.test/api/v1/campaigns");
  });

  it("builds stable workspace and resource query keys", () => {
    expect(queryKeys.campaign("ws-1", "campaign-1")).toEqual([
      "plume", "workspace", "ws-1", "campaign", "campaign-1",
    ]);
    expect(queryKeys.job("ws-1", "job-1")).toEqual([
      "plume", "workspace", "ws-1", "jobs", "job-1",
    ]);
  });
});
