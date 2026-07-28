import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createPolicyReviewerHandler, type PolicyFinding } from "./review-policy.js";

const finding = (overrides: Partial<PolicyFinding> = {}): PolicyFinding => ({
  ruleCode: "TEXT_OVERFLOW",
  severity: "ERROR",
  message: "overflow",
  confidence: 0.99,
  targetElementIds: ["headline"],
  evidence: ["deterministic"],
  ...overrides,
});

describe("AI policy reviewer handler", () => {
  it("preserves deterministic errors and normalizes low-confidence AI errors", async () => {
    const gateway: AgentProviderGateway = {
      execute: async () => ({
        status: "COMPLETED",
        outputJson: {
          results: [
            finding({ message: "ai duplicate", confidence: 0.2 }),
            finding({
              ruleCode: "BRAND_TONE",
              severity: "ERROR",
              message: "tone",
              confidence: 0.2,
            }),
          ],
        },
        latencyMs: 1,
      }),
    };
    const handler = createPolicyReviewerHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      validationRunId: "run-1",
      creativeVersionId: "version-1",
      renderFileId: "file-1",
      brief: {},
      product: null,
      rules: [],
      deterministicResults: [finding()],
      messages: [{ role: "user", content: "Review." }],
    });
    expect(result.normalizedOutput.results).toHaveLength(2);
    expect(result.normalizedOutput.results[0]).toMatchObject({
      ruleCode: "TEXT_OVERFLOW",
      severity: "ERROR",
      message: "overflow",
    });
    expect(result.normalizedOutput.results[1]).toMatchObject({
      ruleCode: "BRAND_TONE",
      severity: "WARNING",
    });
  });
});
