import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createNaturalLanguageEditorHandler } from "./plan-edit-operations.js";

describe("natural language editor handler", () => {
  it("returns a previewable operation batch and requires confirmation for high-impact changes", async () => {
    const output = {
      operations: [
        {
          operationId: "op-1",
          action: "RESIZE" as const,
          targetIds: ["headline"],
          payload: { width: 120 },
          explanation: "fit safe zone",
        },
      ],
      summary: "Resize headline",
      requiresAssetSelection: false,
      requiresUserConfirmation: true,
    };
    const gateway: AgentProviderGateway = {
      execute: async () => ({ status: "COMPLETED", outputJson: output, latencyMs: 1 }),
    };
    const handler = createNaturalLanguageEditorHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      creativeVersionId: "version-1",
      commandText: "크기를 줄여줘",
      creativeDocument: { schemaVersion: "1.0.0" },
      messages: [{ role: "user", content: "Edit." }],
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.agentResult.output?.requiresUserConfirmation).toBe(true);
  });

  it("blocks a high-impact operation without a confirmation flag", async () => {
    const gateway: AgentProviderGateway = {
      execute: async () => ({
        status: "COMPLETED",
        outputJson: {
          operations: [{ operationId: "op-1", action: "DELETE", targetIds: ["logo"], payload: {} }],
          summary: "Delete",
          requiresAssetSelection: false,
          requiresUserConfirmation: false,
        },
        latencyMs: 1,
      }),
    };
    const handler = createNaturalLanguageEditorHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
    });
    await expect(
      handler({
        taskId: "task-2",
        workspaceId: "workspace-1",
        creativeVersionId: "version-1",
        commandText: "로고 삭제",
        creativeDocument: {},
        messages: [{ role: "user", content: "Edit." }],
      }),
    ).rejects.toThrow(/CONFIRMATION/);
  });
});
