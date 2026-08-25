import { describe, expect, it } from "vitest";
import {
  assertProviderAttemptCount,
  assertProviderAttemptPolicy,
  DEFAULT_PROVIDER_ATTEMPT_POLICY,
  LIVE_PROVIDER_ATTEMPT_POLICY,
} from "./thumbnail-semantic-product-flow.js";

describe("Thumbnail semantic provider attempt policies", () => {
  it("keeps CI at exactly one provider attempt", () => {
    expect(() => assertProviderAttemptCount(1, DEFAULT_PROVIDER_ATTEMPT_POLICY)).not.toThrow();
    expect(() => assertProviderAttemptCount(2, DEFAULT_PROVIDER_ATTEMPT_POLICY)).toThrow(
      "AGENT_GENERATE_CALLS_OUT_OF_POLICY",
    );
  });

  it("allows only the existing bounded live retry and repair range", () => {
    for (const attemptCount of [1, 2, 3])
      expect(() =>
        assertProviderAttemptCount(attemptCount, LIVE_PROVIDER_ATTEMPT_POLICY),
      ).not.toThrow();
    expect(() => assertProviderAttemptCount(4, LIVE_PROVIDER_ATTEMPT_POLICY)).toThrow(
      "AGENT_GENERATE_CALLS_OUT_OF_POLICY",
    );
  });

  it("rejects policies that could introduce unbounded attempts", () => {
    expect(() => assertProviderAttemptPolicy({ min: 1, max: 4 })).toThrow(
      "PROVIDER_ATTEMPT_POLICY_OUT_OF_BOUNDS",
    );
    expect(() => assertProviderAttemptPolicy({ min: 2, max: 1 })).toThrow(
      "PROVIDER_ATTEMPT_POLICY_OUT_OF_BOUNDS",
    );
  });
});
