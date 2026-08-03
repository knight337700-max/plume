import { describe, expect, it } from "vitest";
import {
  createAgentOrchestrator,
  type AgentProviderGateway,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import { createExportAssistantHandler } from "./assist-export.js";

describe("export assistant handler", () => {
  it("returns Korean naming proposals inside the export recipe contract", async () => {
    const gateway: AgentProviderGateway = {
      execute: async () => ({
        status: "COMPLETED",
        outputJson: {
          items: [
            {
              creativeVersionId: "version-1",
              relativePath: "자코모/hero.png",
              fileBaseName: "hero",
            },
          ],
          packageName: "자코모_여름",
          notes: ["proposal only"],
        },
        latencyMs: 1,
      }),
    };
    const handler = createExportAssistantHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
    });
    const result = await handler({
      taskId: "task-1",
      workspaceId: "workspace-1",
      exportJobId: "export-1",
      campaign: { name: "자코모" },
      channel: { code: "KAKAO_MOMENT" },
      formatProfile: { id: "kakao-profile", channelCode: "KAKAO_MOMENT" },
      creativeVersions: [{ id: "version-1" }],
      exportRecipe: { requiredExtension: ".png", requiredFiles: ["자코모/hero.png"] },
      messages: [{ role: "user", content: "Name it." }],
    });
    expect(result.status).toBe("COMPLETED");
  });

  it("rejects a proposal that changes the required extension", async () => {
    const gateway: AgentProviderGateway = {
      execute: async () => ({
        status: "COMPLETED",
        outputJson: {
          items: [
            { creativeVersionId: "version-1", relativePath: "hero.jpg", fileBaseName: "hero" },
          ],
          packageName: "package",
          notes: [],
        },
        latencyMs: 1,
      }),
    };
    const handler = createExportAssistantHandler({
      orchestrator: createAgentOrchestrator({ gateway }),
    });
    await expect(
      handler({
        taskId: "task-2",
        workspaceId: "workspace-1",
        exportJobId: "export-1",
        campaign: {},
        channel: { code: "KAKAO_MOMENT" },
        formatProfile: { id: "kakao-profile", channelCode: "KAKAO_MOMENT" },
        creativeVersions: [{ id: "version-1" }],
        exportRecipe: { requiredExtension: ".png" },
        messages: [{ role: "user", content: "Name it." }],
      }),
    ).rejects.toThrow(/EXTENSION/);
  });
});
