import { describe, expect, it } from "vitest";
import { AGENT_CODES, createPromptRegistry, promptDefinitions } from "./prompt-registry.js";
import {
  agentModelPolicyIds,
  modelPolicies,
  modelPolicyRegistry,
} from "./model-policy-registry.js";

describe("AI prompt and model policy registries", () => {
  it("resolves exactly one active prompt and policy for all eight agents", () => {
    const registry = createPromptRegistry();
    expect(registry.listActive()).toHaveLength(8);
    for (const agentCode of AGENT_CODES) {
      const prompt = registry.resolve(agentCode);
      expect(prompt.status).toBe("ACTIVE");
      expect(prompt.modelPolicyId).toBe(agentModelPolicyIds[agentCode]);
      expect(modelPolicyRegistry.forAgent(agentCode).policyId).toBe(prompt.modelPolicyId);
    }
    expect(promptDefinitions).toHaveLength(8);
    expect(modelPolicies).toHaveLength(8);
  });

  it("rejects an active prompt hash change", () => {
    const registry = createPromptRegistry();
    const prompt = registry.resolve("CAMPAIGN_ANALYST");
    expect(() => registry.verifyImmutable({ ...prompt, contentHash: "0".repeat(64) })).toThrow(
      /immutable/,
    );
  });
});
