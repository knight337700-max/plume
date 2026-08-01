import { describe, expect, it } from "vitest";
import {
  ASYNC_COMMAND_DEFINITIONS,
  JACOMO_EXTERNAL_COMMANDS,
  JACOMO_INTERNAL_COMMANDS,
  validateCommandEnvelope,
} from "./async.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("async command contracts", () => {
  it("keeps the catalog definitions aligned with queue routing", () => {
    expect(Object.keys(ASYNC_COMMAND_DEFINITIONS)).toHaveLength(24);
    expect(JACOMO_EXTERNAL_COMMANDS).toEqual(["creative.generate"]);
    expect(JACOMO_INTERNAL_COMMANDS).toEqual([
      "creative.render",
      "validation.run",
      "export.render",
      "export.render_and_package",
    ]);
    expect(ASYNC_COMMAND_DEFINITIONS["creative.generate"]?.payloadSchemaId).toBe(
      "plume.async.creative.generate.v1",
    );
  });

  it("rejects invalid envelope, unknown command, and invalid payload", () => {
    expect(() => validateCommandEnvelope({})).toThrow("MESSAGE_ID_INVALID");
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        createdAt: new Date().toISOString(),
        command: "missing.command",
        payload: {},
      }),
    ).toThrow("UNKNOWN_COMMAND");
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        createdAt: new Date().toISOString(),
        command: "creative.generate",
        payload: { campaignId: id },
      }),
    ).toThrow("PAYLOAD_INVALID");
  });

  it("accepts a durable live smoke scope and bounds its workflow budget", () => {
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        jobItemId: id,
        createdAt: new Date().toISOString(),
        command: "ai.live_smoke",
        payload: {
          agentCode: "COPY_GENERATOR",
          budgetEpochId: id,
          smokeRunId: id,
          workflowCallBudget: 20,
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        createdAt: new Date().toISOString(),
        command: "ai.live_smoke",
        payload: { agentCode: "COPY_GENERATOR", budgetEpochId: id, workflowCallBudget: 21 },
      }),
    ).toThrow("PAYLOAD_INVALID");
  });

  it("accepts only bounded verification-only live smoke payloads", () => {
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        jobItemId: id,
        createdAt: new Date().toISOString(),
        command: "ai.live_smoke.verify",
        payload: {
          verificationRunId: id,
          parentWorkflowJobId: id,
          agentCode: "LAYOUT_PLANNER",
          workspaceId: id,
          smokeRunId: id,
          budgetEpochId: id,
          workflowCallBudget: 8,
          verificationOnly: true,
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateCommandEnvelope({
        messageId: id,
        schemaVersion: 1,
        workspaceId: id,
        correlationId: id,
        jobId: id,
        jobItemId: id,
        createdAt: new Date().toISOString(),
        command: "ai.live_smoke.verify",
        payload: {
          verificationRunId: id,
          parentWorkflowJobId: id,
          agentCode: "LAYOUT_PLANNER",
          workspaceId: id,
          smokeRunId: id,
          budgetEpochId: id,
          workflowCallBudget: 9,
          verificationOnly: true,
        },
      }),
    ).toThrow("PAYLOAD_INVALID");
  });
});
