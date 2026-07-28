import { describe, expect, it } from "vitest";
import { createInMemoryIamRepositories, type WorkspaceMemberRecord, type WorkspaceRecord } from "./repositories.js";
import { createWorkspaceUseCases } from "./workspace-use-cases.js";

const workspace: WorkspaceRecord = { id: "w1", name: "Plume", slug: "plume", status: "ACTIVE", revisionNo: 1 };
const owner: WorkspaceMemberRecord = { id: "m1", workspaceId: "w1", userId: "u1", roleCode: "OWNER", status: "ACTIVE" };
const editor: WorkspaceMemberRecord = { id: "m2", workspaceId: "w1", userId: "u2", roleCode: "EDITOR", status: "ACTIVE" };
describe("workspace policies", () => {
  it("protects the last owner and rejects editor escalation", async () => {
    const useCases = createWorkspaceUseCases(createInMemoryIamRepositories({ workspaces: [workspace], memberships: [owner, editor] }));
    await expect(useCases.removeMember({ workspaceId: "w1", userId: "u1" }, "m1")).rejects.toThrow("last workspace owner");
    await expect(useCases.updateMemberRole({ workspaceId: "w1", userId: "u2" }, "m2", "ADMIN")).rejects.toThrow("owner or admin");
  });
});
