import { describe, expect, it } from "vitest";
import type { DurableWorkflowRepository } from "../../../packages/infrastructure/src/async/durable-workflow-repository.js";
import { createProjectRenderArtifactWorkflow } from "./project-render-artifact-execution.js";

describe("Project renderer artifact workflow completion seam", () => {
  it("leaves legacy non-Project completion unchanged without an active Project context", async () => {
    const calls: unknown[][] = [];
    const workflow = {
      completeItem: async (...args: unknown[]) => {
        calls.push(args);
      },
    } as unknown as DurableWorkflowRepository;
    const decorated = createProjectRenderArtifactWorkflow({
      workflow,
      sql: undefined as never,
      storage: undefined as never,
    });

    await decorated.completeItem("workspace", "job", "item", { status: "COMPLETED" });

    expect(calls).toEqual([["workspace", "job", "item", { status: "COMPLETED" }]]);
  });
});
