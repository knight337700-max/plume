import { describe, expect, it } from "vitest";
import { createToolExecutor } from "./tool-executor.js";

const request = {
  requestId: "request-1",
  agentCode: "PRODUCT_MATCHER" as const,
  toolCode: "product_search",
  workspaceId: "workspace-1",
  subjectId: "campaign-1",
  input: { query: "세럼" },
};

describe("agent tool executor", () => {
  it("injects workspace context and returns a bounded hashed read result", async () => {
    let receivedWorkspace = "";
    const executor = createToolExecutor({
      handlers: {
        product_search: ({ workspaceId }) => {
          receivedWorkspace = workspaceId;
          return { items: [{ id: "product-1" }] };
        },
      },
    });
    const result = await executor.execute(request);
    expect(receivedWorkspace).toBe("workspace-1");
    expect(result.resultHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects unknown, unauthorized and client-supplied workspace tools", async () => {
    const executor = createToolExecutor({ handlers: { product_search: () => [] } });
    await expect(executor.execute({ ...request, toolCode: "delete_file" })).rejects.toThrow(
      /Unknown/,
    );
    await expect(executor.execute({ ...request, agentCode: "COPY_GENERATOR" })).rejects.toThrow(
      /Unauthorized/,
    );
    await expect(executor.execute({ ...request, input: { workspaceId: "other" } })).rejects.toThrow(
      /injected/,
    );
  });
});
