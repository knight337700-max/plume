import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createApprovalUseCases } from "../../../../../packages/core/src/modules/approval/use-cases.js";
import { createInMemoryApprovalRepositories } from "../../../../../packages/core/src/modules/approval/repositories.js";
import { createInMemoryValidationRepositories } from "../../../../../packages/core/src/modules/validation/repositories.js";
import { approvalRouteGroup } from "./index.js";

describe("approval routes", () => {
  it("serves approval decisions and workspace-scoped comments", async () => {
    const validations = createInMemoryValidationRepositories();
    const run = await validations.createRun({ id: "run-1", workspaceId: "workspace-1", creativeVersionId: "version-1", formatSnapshotJson: {}, ruleSnapshotJson: {} });
    await validations.updateRun("workspace-1", run.id, { status: "PASS", summaryJson: { errorCount: 0 }, completedAt: new Date().toISOString() });
    const app = Fastify({ logger: false });
    await app.register(approvalRouteGroup, { useCases: createApprovalUseCases({ approvals: createInMemoryApprovalRepositories(), validations }) });
    const created = await app.inject({ method: "POST", url: "/api/v1/workspaces/workspace-1/creative-versions/version-1/approval-requests", headers: { "idempotency-key": "approval-1", "x-user-id": "requester", "x-self-approval": "true" }, payload: { validationRunId: run.id } });
    expect(created.statusCode).toBe(201);
    const approvalId = created.json().data.id;
    const approved = await app.inject({ method: "POST", url: `/api/v1/workspaces/workspace-1/approval-requests/${approvalId}.approve`, headers: { "x-user-id": "reviewer", "x-workspace-role": "REVIEWER", "x-self-approval": "true" }, payload: {} });
    expect(approved.statusCode).toBe(200);
    const comment = await app.inject({ method: "POST", url: "/api/v1/workspaces/workspace-1/comment-threads/thread-1/comments", headers: { "idempotency-key": "comment-1", "x-user-id": "reviewer" }, payload: { body: "approved" } });
    expect(comment.statusCode).toBe(201);
    const comments = await app.inject({ method: "GET", url: "/api/v1/workspaces/workspace-1/comment-threads/thread-1/comments" });
    expect(comments.json().items).toHaveLength(1);
    await app.close();
  });
});
