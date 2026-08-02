import { describe, expect, it } from "vitest";
import { createDeterministicMockProviderGateway } from "./mock-provider.js";

describe("deterministic mock provider", () => {
  it("provides the staging connectivity contract without a live call", async () => {
    const result = await createDeterministicMockProviderGateway().execute({
      taskId: "mock-connectivity",
      modelPolicyId: "balanced-structured-v1",
      messages: [{ role: "user", content: "synthetic" }],
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          environment: { type: "string" },
          provider: { type: "string" },
        },
        required: ["status", "environment", "provider"],
        additionalProperties: false,
      },
      imageInputs: [],
      timeoutSeconds: 1,
      metadata: {
        workspaceId: "workspace-1",
        agentCode: "CONNECTIVITY_TEST",
        promptVersion: "1.0.0",
        correlationId: "mock-connectivity",
      },
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.outputJson).toEqual({
      status: "ok",
      environment: "staging",
      provider: "openai",
    });
  });

  it("materializes nullable strict transport fields for layout smoke", async () => {
    const result = await createDeterministicMockProviderGateway().execute({
      taskId: "mock-layout",
      modelPolicyId: "balanced-structured-v1",
      messages: [{ role: "user", content: "synthetic" }],
      outputSchema: {
        type: "object",
        properties: {
          copyAssets: { type: "array", items: { type: "string" } },
          riskFlags: { type: ["array", "null"], items: { type: "string" } },
        },
        required: ["copyAssets", "riskFlags"],
        additionalProperties: false,
      },
      imageInputs: [],
      timeoutSeconds: 1,
      metadata: {
        workspaceId: "workspace-1",
        agentCode: "LAYOUT_PLANNER",
        promptVersion: "1.0.0",
        correlationId: "mock-layout",
      },
    });
    expect(result.outputJson).toMatchObject({ copyAssets: [], riskFlags: null });
  });
});
