import { describe, expect, it } from "vitest";
import { createInMemoryIamRepositories, type WorkspaceMemberRecord, type WorkspaceRecord } from "../../../core/src/modules/iam/repositories.js";
const workspace: WorkspaceRecord = { id: "w1", name: "Plume", slug: "plume", status: "ACTIVE", revisionNo: 1 };
const owner: WorkspaceMemberRecord = { id: "m1", workspaceId: "w1", userId: "u1", roleCode: "OWNER", status: "ACTIVE" };
describe("IAM repository contract", () => { it("scopes membership queries and protects the last owner", async () => { const repositories = createInMemoryIamRepositories({ workspaces: [workspace], memberships: [owner] }); expect(await repositories.getMembership("w1", "u1")).toMatchObject({ roleCode: "OWNER" }); await expect(repositories.removeMembership("w1", "m1", "u1")).rejects.toThrow("last workspace owner"); expect(await repositories.getMembership("w1", "u2")).toBeNull(); }); });
