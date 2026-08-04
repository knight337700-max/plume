import { describe, expect, it } from "vitest";
import { classifyLiveSmokeFailure, stableErrorCode } from "./live-smoke-failure-evidence-store.js";

const state = {
  reservationCreated: true,
  dispatchStarted: true,
  sdkAttempted: true,
  providerResponseReceived: true,
  usagePresent: true,
} as const;

describe("live smoke stable failure classification", () => {
  it.each([
    ["LIVE_SMOKE_SYNTHETIC_SCENARIO_REQUIRED", "PRE_DISPATCH_VALIDATION"],
    ["LIVE_SMOKE_REQUEST_BUDGET_REACHED", "BUDGET_RESERVATION"],
    ["LIVE_SMOKE_SDK_ATTEMPT_BOUNDARY_FAILED", "DISPATCH_EVIDENCE"],
    ["LIVE_SMOKE_UNKNOWN_BILLABLE", "UNKNOWN_BILLABLE"],
    ["SCHEMA_VALIDATION_FAILED", "STRUCTURED_OUTPUT_SCHEMA"],
    ["LIVE_SMOKE_DOMAIN_VALIDATION_FAILED", "DOMAIN_VALIDATION"],
    ["LIVE_SMOKE_SETTLEMENT_FAILED", "SETTLEMENT"],
    ["LIVE_SMOKE_VALIDATION_EVIDENCE_WRITE_FAILED", "EVIDENCE_WRITE"],
  ] as const)("classifies %s as %s", (code, failureClass) => {
    expect(classifyLiveSmokeFailure({ error: new Error(code), ...state }).failureClass).toBe(
      failureClass,
    );
  });

  it("does not retain dynamic suffixes or raw messages in the stable code", () => {
    expect(
      stableErrorCode(
        Object.assign(new Error("raw response must not persist"), {
          code: "AI_LIVE_SMOKE_AGENT_FAILED:CAMPAIGN_ANALYST:SCHEMA_VALIDATION_FAILED",
        }),
      ),
    ).toBe("SCHEMA_VALIDATION_FAILED");
    expect(stableErrorCode(new Error("raw response contains a secret"))).toBe("LIVE_SMOKE_FAILURE");
  });

  it("classifies an SDK-boundary failure before a request as dispatch evidence", () => {
    expect(
      classifyLiveSmokeFailure({
        error: new Error("LIVE_SMOKE_SDK_ATTEMPT_BOUNDARY_FAILED"),
        ...state,
        sdkAttempted: false,
        providerResponseReceived: false,
        usagePresent: false,
      }),
    ).toMatchObject({ failureClass: "DISPATCH_EVIDENCE", stage: "DISPATCH" });
  });
});
