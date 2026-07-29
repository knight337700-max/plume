import { describe, expect, it } from "vitest";
import { assertCanApprove, assertCanRequestApproval } from "./approval-policy.js";

const run = { id: "run-1", workspaceId: "ws-1", creativeVersionId: "version-1", runNo: 1, status: "WARNING" as const, formatSnapshotJson: {}, ruleSnapshotJson: {}, summaryJson: { errorCount: 0 }, createdAt: "2026-07-29T00:00:00.000Z" };
const warning = { id: "result-1", workspaceId: "ws-1", validationRunId: "run-1", ruleCode: "COPY", ruleVersion: "1", resultType: "DETERMINISTIC" as const, severity: "WARNING" as const, status: "OPEN" as const, targetElementIdsJson: [], message: "warning", detailsJson: {}, createdAt: "2026-07-29T00:00:00.000Z" };

describe("approval policy", () => {
  it("blocks open errors and stale validation", () => {
    expect(() => assertCanRequestApproval({ currentCreativeVersionId: "version-1", validationRun: { ...run, summaryJson: { errorCount: 1 } }, actorRole: "EDITOR", selfApprovalAllowed: false })).toThrow(/Open validation errors/);
    expect(() => assertCanRequestApproval({ currentCreativeVersionId: "version-2", validationRun: run, actorRole: "EDITOR", selfApprovalAllowed: false })).toThrow(/current Creative/);
  });

  it("requires warning acknowledgement and enforces self approval", () => {
    expect(() => assertCanApprove({ currentCreativeVersionId: "version-1", validationRun: run, validationResults: [warning], actorRole: "REVIEWER", selfApprovalAllowed: false, requesterId: "user-1", actorId: "user-2" })).toThrow(/acknowledgement/);
    expect(() => assertCanApprove({ currentCreativeVersionId: "version-1", validationRun: run, validationResults: [warning], warningAcknowledgements: [{ id: "ack-1", workspaceId: "ws-1", validationResultId: "result-1", acknowledgedBy: "user-2", reason: "accepted", createdAt: "2026-07-29T00:00:00.000Z" }], actorRole: "REVIEWER", selfApprovalAllowed: false, requesterId: "user-1", actorId: "user-1" })).toThrow(/self approval/);
  });
});
