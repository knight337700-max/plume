import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "@plume/core/src/public.js";
import { createOpenAIProviderRuntime } from "./provider-runtime.js";

describe("OpenAI mock/live provider runtime", () => {
  it("resolves mock mode without an API key for all eight agents", async () => {
    const runtime = createOpenAIProviderRuntime({ environment: { OPENAI_PROVIDER_MODE: "mock" } });
    expect(runtime.mode).toBe("mock");
    for (const agentCode of AGENT_CODES) {
      const result = await runtime.gateway.execute({
        taskId: `task-${agentCode}`,
        modelPolicyId: "balanced-structured-v1",
        messages: [],
        outputSchema: { type: "object" },
        imageInputs: [],
        timeoutSeconds: 1,
        metadata: {
          workspaceId: "workspace-1",
          agentCode,
          promptVersion: "1.0.0",
          correlationId: "corr-1",
        },
      });
      expect(result.status).toBe("COMPLETED");
    }
  });

  it("fails live mode without key or model and never falls back to mock", () => {
    expect(() =>
      createOpenAIProviderRuntime({
        environment: { OPENAI_PROVIDER_MODE: "live", OPENAI_MODEL: "gpt-5.6-luna" },
      }),
    ).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      createOpenAIProviderRuntime({
        environment: {
          OPENAI_PROVIDER_MODE: "live",
          OPENAI_API_KEY: "key",
          OPENAI_MODEL: "gpt-5-mini",
        },
      }),
    ).toThrow(/Unsupported OPENAI_MODEL/);
    expect(() =>
      createOpenAIProviderRuntime({ environment: { OPENAI_PROVIDER_MODE: "invalid" } }),
    ).toThrow(/OPENAI_PROVIDER_MODE/);
  });

  it("resolves the Luna default without model fallback", () => {
    expect(() =>
      createOpenAIProviderRuntime({
        environment: { OPENAI_PROVIDER_MODE: "live", OPENAI_API_KEY: "key" },
        liveGateway: {
          execute: async () => ({
            provider: "OpenAI",
            model: "gpt-5.6-luna",
            status: "COMPLETED",
            latencyMs: 1,
          }),
        },
      }),
    ).not.toThrow();
  });
});
