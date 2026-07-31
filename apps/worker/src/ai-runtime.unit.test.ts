import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "../../../packages/core/src/public.js";
import { createWorkerAIRuntime } from "./ai-runtime.js";

describe("worker AI runtime", () => {
  it("shares one selected provider runtime with all eight agent policies", () => {
    const runtime = createWorkerAIRuntime({ environment: { OPENAI_PROVIDER_MODE: "mock" } });
    expect(runtime.provider.mode).toBe("mock");
    expect(AGENT_CODES).toHaveLength(8);
    expect(runtime.orchestrator).toBeDefined();
  });
});
