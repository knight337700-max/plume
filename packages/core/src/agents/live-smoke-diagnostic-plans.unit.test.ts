import { describe, expect, it } from "vitest";
import {
  LIVE_SMOKE_DIAGNOSTIC_PLAN_ID,
  assertDiagnosticAgentAllowed,
  resolveLiveSmokeDiagnosticPlan,
} from "./live-smoke-diagnostic-plans.js";

describe("controlled diagnostic plan", () => {
  it("resolves only the literal Canary + Campaign Analyst plan", () => {
    const plan = resolveLiveSmokeDiagnosticPlan(LIVE_SMOKE_DIAGNOSTIC_PLAN_ID);
    expect(plan).toMatchObject({
      canary: 1,
      initialAgents: ["CAMPAIGN_ANALYST"],
      otherAgents: [],
      maximumRetryCalls: 1,
      maximumRepairCalls: 1,
      absoluteProviderCallCap: 4,
      concurrency: 1,
      effectiveHardCapMicroUsd: 500_000,
      r3CarryForwardMicroUsd: 1_500_000,
    });
  });

  it("rejects unknown plans and agents outside the allowlist", () => {
    expect(() => resolveLiveSmokeDiagnosticPlan("all-agents")).toThrow(
      "LIVE_SMOKE_DIAGNOSTIC_PLAN_UNKNOWN",
    );
    const plan = resolveLiveSmokeDiagnosticPlan(LIVE_SMOKE_DIAGNOSTIC_PLAN_ID);
    expect(() => assertDiagnosticAgentAllowed(plan, "PRODUCT_MATCHER")).toThrow(
      "LIVE_SMOKE_DIAGNOSTIC_AGENT_NOT_ALLOWED",
    );
  });
});
