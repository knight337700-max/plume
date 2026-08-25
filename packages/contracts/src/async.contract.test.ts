import { describe, expect, it } from "vitest";
import {
  ASYNC_COMMAND_DEFINITIONS,
  JACOMO_EXTERNAL_COMMANDS,
  JACOMO_INTERNAL_COMMANDS,
  LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX,
  validateCommandEnvelope,
} from "./async.js";
import { LIVE_SMOKE_SYNTHETIC_SCENARIO_ID } from "../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("async command contracts", () => {
  it("keeps the catalog definitions aligned with queue routing", () => {
    expect(Object.keys(ASYNC_COMMAND_DEFINITIONS)).toHaveLength(25);
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
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
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
        payload: {
          agentCode: "COPY_GENERATOR",
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
          budgetEpochId: id,
          workflowCallBudget: 21,
        },
      }),
    ).toThrow("PAYLOAD_INVALID");
  });

  it("uses one transport ceiling for canary, agent, and verification budgets", () => {
    expect(LIVE_SMOKE_WORKFLOW_CALL_BUDGET_MAX).toBe(20);
    const envelope = (command: string, payload: unknown) => ({
      messageId: id,
      schemaVersion: 1,
      workspaceId: id,
      correlationId: id,
      jobId: id,
      jobItemId: id,
      createdAt: new Date().toISOString(),
      command,
      payload,
    });
    const canaryPayload = (workflowCallBudget: number) => ({
      verificationRunId: id,
      parentWorkflowJobId: id,
      workspaceId: id,
      smokeRunId: id,
      budgetEpochId: id,
      workflowCallBudget,
      syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      canary: true,
    });

    for (const workflowCallBudget of [1, 7, 13, 20]) {
      expect(() =>
        validateCommandEnvelope(
          envelope("ai.live_smoke.canary", canaryPayload(workflowCallBudget)),
        ),
      ).not.toThrow();
    }
    for (const workflowCallBudget of [0, -1, 1.5, 21]) {
      expect(() =>
        validateCommandEnvelope(
          envelope("ai.live_smoke.canary", canaryPayload(workflowCallBudget)),
        ),
      ).toThrow("PAYLOAD_INVALID");
    }
    expect(() =>
      validateCommandEnvelope(
        envelope("ai.live_smoke.verify", {
          verificationRunId: id,
          parentWorkflowJobId: id,
          agentCode: "LAYOUT_PLANNER",
          workspaceId: id,
          smokeRunId: id,
          budgetEpochId: id,
          workflowCallBudget: 13,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
          canaryVerificationRunId: id,
          verificationOnly: true,
        }),
      ),
    ).not.toThrow();
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
          workflowCallBudget: 20,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
          canaryVerificationRunId: id,
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
          workflowCallBudget: 21,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
          canaryVerificationRunId: id,
          verificationOnly: true,
        },
      }),
    ).toThrow("PAYLOAD_INVALID");
  });

  it("rejects missing, unknown, and freeform synthetic scope", () => {
    const envelope = (command: string, payload: unknown) => ({
      messageId: id,
      schemaVersion: 1,
      workspaceId: id,
      correlationId: id,
      jobId: id,
      jobItemId: id,
      createdAt: new Date().toISOString(),
      command,
      payload,
    });
    const base = {
      verificationRunId: id,
      parentWorkflowJobId: id,
      workspaceId: id,
      smokeRunId: id,
      budgetEpochId: id,
      workflowCallBudget: 13,
      canary: true,
    };
    expect(() => validateCommandEnvelope(envelope("ai.live_smoke.canary", base))).toThrow(
      "PAYLOAD_INVALID",
    );
    expect(() =>
      validateCommandEnvelope(
        envelope("ai.live_smoke.canary", {
          ...base,
          syntheticScenarioId: "SYNTHETIC_JACOMO_NAVER_GFA_2026_1",
        }),
      ),
    ).toThrow("PAYLOAD_INVALID");
    expect(() =>
      validateCommandEnvelope(
        envelope("ai.live_smoke.canary", {
          ...base,
          syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
          channel: "KAKAO_MOMENT",
        }),
      ),
    ).toThrow("PAYLOAD_INVALID");
  });
});
