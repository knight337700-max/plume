import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "./prompt-registry.js";
import { createAgentOrchestrator, type AgentProviderGateway } from "./orchestrator.js";

const schema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
} as const;

describe("agent orchestrator", () => {
  it("runs the eight-agent mock matrix with policy, context and metadata", async () => {
    const gateway: AgentProviderGateway = {
      execute: async (request) => ({
        status: "COMPLETED",
        outputJson: { ok: true },
        providerRequestId: request.taskId,
        latencyMs: 1,
        usage: { inputUnits: 1, outputUnits: 1 },
      }),
    };
    const orchestrator = createAgentOrchestrator({ gateway });
    for (const agentCode of AGENT_CODES) {
      const result = await orchestrator.run({
        taskId: `task-${agentCode}`,
        agentCode,
        workspaceId: "workspace-1",
        subjectType: "CAMPAIGN",
        subjectId: "campaign-1",
        correlationId: "corr-1",
        data: {},
        messages: [{ role: "user", content: "Return the fixture." }],
        outputSchema: schema,
      });
      expect(result.status).toBe("COMPLETED");
      expect(result.stateTransitions).toEqual(["QUEUED", "RUNNING", "COMPLETED"]);
      expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(result.metadata.contextHash).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("does not call a handler for invalid output and permits one repair attempt", async () => {
    let calls = 0;
    let handled = 0;
    const orchestrator = createAgentOrchestrator({
      gateway: {
        execute: async () => ({
          status: "COMPLETED",
          outputJson: calls++ === 0 ? { wrong: true } : { ok: true },
          latencyMs: 1,
        }),
      },
    });
    const result = await orchestrator.run(
      {
        taskId: "repair-task",
        agentCode: "COPY_GENERATOR",
        workspaceId: "workspace-1",
        subjectType: "CAMPAIGN",
        subjectId: "campaign-1",
        correlationId: "corr-1",
        data: {},
        messages: [{ role: "user", content: "Repair." }],
        outputSchema: schema,
      },
      async () => {
        handled += 1;
      },
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.metadata.attempt).toBe(2);
    expect(handled).toBe(1);
  });

  it("retries one transient provider failure and records the bounded attempt", async () => {
    let calls = 0;
    const orchestrator = createAgentOrchestrator({
      gateway: {
        execute: async () => {
          calls += 1;
          return calls === 1
            ? {
                status: "FAILED" as const,
                latencyMs: 1,
                error: { code: "RATE_LIMIT", message: "synthetic", retryable: true },
              }
            : { status: "COMPLETED" as const, outputJson: { ok: true }, latencyMs: 1 };
        },
      },
    });
    const result = await orchestrator.run({
      taskId: "retry-task",
      agentCode: "COPY_GENERATOR",
      workspaceId: "workspace-1",
      subjectType: "CAMPAIGN",
      subjectId: "campaign-1",
      correlationId: "corr-retry",
      data: {},
      messages: [{ role: "user", content: "Retry." }],
      outputSchema: schema,
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.metadata.attempt).toBe(2);
    expect(calls).toBe(2);
  });
});
