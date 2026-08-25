import { describe, expect, it } from "vitest";
import { assertJobWorkspaceScope } from "./jacomo-runtime.js";

describe("worker workspace scope", () => {
  it("rejects a command payload that names another workspace", () => {
    expect(() =>
      assertJobWorkspaceScope({
        workspaceId: "workspace-a",
        payload: { workspaceId: "workspace-b" },
      }),
    ).toThrow(/COMMAND_PAYLOAD_WORKSPACE_MISMATCH/);
  });

  it("accepts payloads without a duplicated workspace field", () => {
    expect(() =>
      assertJobWorkspaceScope({ workspaceId: "workspace-a", payload: { job: "scoped" } }),
    ).not.toThrow();
  });
});
