import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAgentOrchestrator, type AgentProviderGateway } from "./orchestrator.js";

const schema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: { ok: { type: "boolean" } },
} as const;

function imageInput() {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return {
    fileId: "file-image-1",
    mimeType: "image/png" as const,
    bytes,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    detail: "high" as const,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "image-task",
    agentCode: "LAYOUT_PLANNER" as const,
    workspaceId: "workspace-1",
    subjectType: "CAMPAIGN",
    subjectId: "campaign-1",
    correlationId: "corr-image",
    data: {},
    messages: [{ role: "user" as const, content: "Inspect the image." }],
    outputSchema: schema,
    ...overrides,
  };
}

describe("Agent image input transport", () => {
  it("forwards one valid image unchanged", async () => {
    const input = imageInput();
    let received: readonly (typeof input)[] | undefined;
    const gateway: AgentProviderGateway = {
      execute: async (request) => {
        received = request.imageInputs;
        return { status: "COMPLETED", outputJson: { ok: true }, latencyMs: 1 };
      },
    };
    const taskInput = task({ imageInputs: [input] });
    const result = await createAgentOrchestrator({ gateway }).run(taskInput);
    expect(result.status).toBe("COMPLETED");
    expect(received).toBe(taskInput.imageInputs);
    expect(received).toEqual([input]);
  });

  it("rejects a checksum mismatch before the provider call", async () => {
    let calls = 0;
    const gateway: AgentProviderGateway = {
      execute: async () => {
        calls += 1;
        return { status: "COMPLETED", outputJson: { ok: true }, latencyMs: 1 };
      },
    };
    await expect(
      createAgentOrchestrator({ gateway }).run(
        task({ imageInputs: [{ ...imageInput(), checksumSha256: "0".repeat(64) }] }),
      ),
    ).rejects.toThrow("AGENT_IMAGE_INPUT_CHECKSUM_MISMATCH");
    expect(calls).toBe(0);
  });

  it("rejects images for a non-VISION model policy before the provider", async () => {
    let calls = 0;
    const gateway: AgentProviderGateway = {
      execute: async () => {
        calls += 1;
        return { status: "COMPLETED", outputJson: { ok: true }, latencyMs: 1 };
      },
    };
    await expect(
      createAgentOrchestrator({ gateway }).run(
        task({ agentCode: "COPY_GENERATOR", imageInputs: [imageInput()] }),
      ),
    ).rejects.toThrow("AGENT_IMAGE_INPUTS_REQUIRE_VISION_POLICY");
    expect(calls).toBe(0);
  });

  it("preserves exact image inputs across retry and repair", async () => {
    const input = imageInput();
    const retryRequests: unknown[] = [];
    let calls = 0;
    const retryGateway: AgentProviderGateway = {
      execute: async (request) => {
        retryRequests.push(request.imageInputs);
        calls += 1;
        return calls === 1
          ? {
              status: "FAILED",
              latencyMs: 1,
              error: { code: "RATE_LIMIT", message: "retry", retryable: true },
            }
          : { status: "COMPLETED", outputJson: { ok: true }, latencyMs: 1 };
      },
    };
    await createAgentOrchestrator({ gateway: retryGateway }).run(task({ imageInputs: [input] }));
    expect(retryRequests[0]).toBe(retryRequests[1]);

    const repairRequests: unknown[] = [];
    calls = 0;
    const repairGateway: AgentProviderGateway = {
      execute: async (request) => {
        repairRequests.push(request.imageInputs);
        calls += 1;
        return {
          status: "COMPLETED",
          outputJson: calls === 1 ? { wrong: true } : { ok: true },
          latencyMs: 1,
        };
      },
    };
    await createAgentOrchestrator({ gateway: repairGateway }).run(task({ imageInputs: [input] }));
    expect(repairRequests[0]).toBe(repairRequests[1]);
  });

  it("keeps text-only calls on the existing empty-input path", async () => {
    let received: readonly unknown[] | undefined;
    const result = await createAgentOrchestrator({
      gateway: {
        execute: async (request) => {
          received = request.imageInputs;
          return { status: "COMPLETED", outputJson: { ok: true }, latencyMs: 1 };
        },
      },
    }).run(task());
    expect(result.status).toBe("COMPLETED");
    expect(received).toEqual([]);
  });
});
