import type { AgentCode } from "./prompt-registry.js";

export type ModelCapability =
  | "STRUCTURED_OUTPUT"
  | "KOREAN"
  | "LONG_CONTEXT"
  | "VISION"
  | "COPYWRITING"
  | "EDIT_PLANNING"
  | "POLICY_REVIEW"
  | "NAMING";
export type LatencyClass = "FAST" | "BALANCED" | "QUALITY";

export interface ModelPolicy {
  readonly policyId: string;
  readonly requiredCapabilities: readonly ModelCapability[];
  readonly latencyClass: LatencyClass;
  readonly maxInputUnits: number;
  readonly maxOutputUnits: number;
  readonly temperature: number;
  readonly fallbackPolicyId?: string;
}

const POLICIES: readonly ModelPolicy[] = Object.freeze([
  {
    policyId: "quality-long-context-v1",
    requiredCapabilities: ["STRUCTURED_OUTPUT", "KOREAN", "LONG_CONTEXT"],
    latencyClass: "QUALITY",
    maxInputUnits: 120000,
    maxOutputUnits: 12000,
    temperature: 0.2,
    fallbackPolicyId: "balanced-structured-v1",
  },
  {
    policyId: "balanced-structured-v1",
    requiredCapabilities: ["STRUCTURED_OUTPUT", "KOREAN"],
    latencyClass: "BALANCED",
    maxInputUnits: 40000,
    maxOutputUnits: 8000,
    temperature: 0.1,
  },
  {
    policyId: "vision-quality-v1",
    requiredCapabilities: ["VISION", "STRUCTURED_OUTPUT"],
    latencyClass: "QUALITY",
    maxInputUnits: 50000,
    maxOutputUnits: 8000,
    temperature: 0.1,
    fallbackPolicyId: "vision-balanced-v1",
  },
  {
    policyId: "vision-balanced-v1",
    requiredCapabilities: ["VISION", "STRUCTURED_OUTPUT"],
    latencyClass: "BALANCED",
    maxInputUnits: 30000,
    maxOutputUnits: 6000,
    temperature: 0.1,
  },
  {
    policyId: "copywriting-balanced-v1",
    requiredCapabilities: ["COPYWRITING", "STRUCTURED_OUTPUT", "KOREAN"],
    latencyClass: "BALANCED",
    maxInputUnits: 20000,
    maxOutputUnits: 6000,
    temperature: 0.6,
    fallbackPolicyId: "balanced-structured-v1",
  },
  {
    policyId: "fast-edit-v1",
    requiredCapabilities: ["EDIT_PLANNING", "STRUCTURED_OUTPUT", "KOREAN"],
    latencyClass: "FAST",
    maxInputUnits: 20000,
    maxOutputUnits: 4000,
    temperature: 0.1,
    fallbackPolicyId: "balanced-structured-v1",
  },
  {
    policyId: "policy-review-v1",
    requiredCapabilities: ["VISION", "POLICY_REVIEW", "STRUCTURED_OUTPUT", "KOREAN"],
    latencyClass: "QUALITY",
    maxInputUnits: 40000,
    maxOutputUnits: 8000,
    temperature: 0,
    fallbackPolicyId: "vision-balanced-v1",
  },
  {
    policyId: "fast-naming-v1",
    requiredCapabilities: ["STRUCTURED_OUTPUT", "NAMING", "KOREAN"],
    latencyClass: "FAST",
    maxInputUnits: 10000,
    maxOutputUnits: 2000,
    temperature: 0.1,
    fallbackPolicyId: "balanced-structured-v1",
  },
]);

const AGENT_POLICIES: Readonly<Record<AgentCode, string>> = Object.freeze({
  CAMPAIGN_ANALYST: "quality-long-context-v1",
  PRODUCT_MATCHER: "balanced-structured-v1",
  ASSET_CURATOR: "vision-quality-v1",
  COPY_GENERATOR: "copywriting-balanced-v1",
  LAYOUT_PLANNER: "vision-quality-v1",
  NATURAL_LANGUAGE_EDITOR: "fast-edit-v1",
  AI_POLICY_REVIEWER: "policy-review-v1",
  EXPORT_ASSISTANT: "fast-naming-v1",
});

export interface ModelPolicyRegistry {
  resolve(policyId: string): ModelPolicy;
  forAgent(agentCode: AgentCode): ModelPolicy;
  list(): readonly ModelPolicy[];
}

export function createModelPolicyRegistry(
  policies: readonly ModelPolicy[] = POLICIES,
): ModelPolicyRegistry {
  const byId = new Map(
    policies.map((policy) => [
      policy.policyId,
      Object.freeze({
        ...policy,
        requiredCapabilities: Object.freeze([...policy.requiredCapabilities]),
      }),
    ]),
  );
  return {
    resolve(policyId) {
      const policy = byId.get(policyId);
      if (!policy) throw new Error(`Unknown model policy: ${policyId}`);
      return policy;
    },
    forAgent(agentCode) {
      return this.resolve(AGENT_POLICIES[agentCode]);
    },
    list() {
      return Object.freeze([...byId.values()]);
    },
  };
}

export const modelPolicyRegistry = createModelPolicyRegistry();
export const agentModelPolicyIds = AGENT_POLICIES;
export const modelPolicies = POLICIES;
