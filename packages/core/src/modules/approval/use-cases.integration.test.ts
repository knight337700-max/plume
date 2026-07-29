import { describe, expect, it } from "vitest";
import { createApprovalUseCases } from "./use-cases.js";
import { createInMemoryApprovalRepositories } from "./repositories.js";
import { createInMemoryValidationRepositories } from "../validation/repositories.js";

describe("approval use cases", () => {
  it("keeps decisions append-only, enforces warnings and supersedes pending requests", async () => {
    const validations = createInMemoryValidationRepositories();
    const run = await validations.createRun({ id: "run-1", workspaceId: "ws-1", creativeVersionId: "version-1", formatSnapshotJson: {}, ruleSnapshotJson: {} });
    await validations.updateRun("ws-1", run.id, { status: "PASS", summaryJson: { errorCount: 0 }, completedAt: new Date().toISOString() });
    const approvals = createInMemoryApprovalRepositories();
    const useCases = createApprovalUseCases({ approvals, validations });
    const request = await useCases.createRequest({ workspaceId: "ws-1", creativeVersionId: "version-1", validationRunId: run.id, requestedBy: "requester", actorRole: "EDITOR", selfApprovalAllowed: true });
    const approved = await useCases.decide({ workspaceId: "ws-1", approvalRequestId: request.id, decision: "APPROVED", actorId: "reviewer", actorRole: "REVIEWER", selfApprovalAllowed: true, currentCreativeVersionId: "version-1" });
    expect(approved.status).toBe("APPROVED");
    expect((await useCases.listDecisions("ws-1", request.id))).toHaveLength(1);
    const oldRun = await validations.createRun({ id: "run-old", workspaceId: "ws-1", creativeVersionId: "version-old", formatSnapshotJson: {}, ruleSnapshotJson: {} });
    await validations.updateRun("ws-1", oldRun.id, { status: "PASS", summaryJson: { errorCount: 0 }, completedAt: new Date().toISOString() });
    const pending = await useCases.createRequest({ workspaceId: "ws-1", creativeVersionId: "version-old", validationRunId: oldRun.id, requestedBy: "requester", actorRole: "EDITOR", selfApprovalAllowed: true });
    const superseded = await useCases.supersede({ workspaceId: "ws-1", previousCreativeVersionId: "version-old", supersededBy: "version-new" });
    expect(superseded.find((item) => item.id === pending.id)?.status).toBe("SUPERSEDED");
  });
});
