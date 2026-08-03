import { describe, expect, it } from "vitest";
import {
  calculateLiveSmokeCostMicroUsd,
  calculateLiveSmokeReservationMicroUsd,
  createLiveSmokePricingPolicy,
  assertLiveSmokeInputEstimate,
  estimateLiveSmokeInputTokens,
} from "./live-smoke-spend-policy.js";

const policy = {
  model: "gpt-5.6-luna",
  pricingVersion: "test-v1",
  inputMicroUsdPerMillionTokens: 2_000_000,
  outputMicroUsdPerMillionTokens: 4_000_000,
} as const;

describe("durable live smoke spend policy", () => {
  const controlledEnvironment = {
    OPENAI_PROVIDER_MODE: "live",
    OPENAI_MODEL: "gpt-5.6-luna",
    OPENAI_PRICING_VERSION: "openai-gpt-5.6-luna-standard-2026-08-03",
    OPENAI_INPUT_COST_MICRO_USD_PER_MILLION: "1000000",
    OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION: "6000000",
    OPENAI_CACHED_INPUT_COST_MICRO_USD_PER_MILLION: "100000",
    OPENAI_LIVE_MAX_ESTIMATED_INPUT_TOKENS: "250000",
    OPENAI_LIVE_PER_RUN_SOFT_STOP_MICRO_USD: "1000000",
    OPENAI_LIVE_PER_RUN_HARD_CAP_MICRO_USD: "2000000",
    OPENAI_LIVE_MONTHLY_LIMIT_MICRO_USD: "5000000",
    OPENAI_LIVE_SAFETY_BUFFER_MICRO_USD: "500000",
    OPENAI_LIVE_ABSOLUTE_PROVIDER_CALL_CAP: "13",
    OPENAI_LIVE_BILLING_SCOPE: "plume-controlled-live-qa",
  } as const;

  it("requires explicit pricing only for live mode and never falls back", () => {
    expect(createLiveSmokePricingPolicy({ OPENAI_PROVIDER_MODE: "mock" })).toBeUndefined();
    expect(() =>
      createLiveSmokePricingPolicy({
        OPENAI_PROVIDER_MODE: "live",
        OPENAI_MODEL: "gpt-5.6-luna",
      }),
    ).toThrow(/OPENAI_PRICING_VERSION/);
  });

  it("calculates fixed-precision micro-USD amounts without floating point", () => {
    expect(calculateLiveSmokeCostMicroUsd(policy, { inputUnits: 3, outputUnits: 2 })).toBe(14);
    expect(calculateLiveSmokeReservationMicroUsd(policy, 10, 5)).toBe(40);
  });

  it("rejects unsupported models and non-positive rates", () => {
    expect(() =>
      createLiveSmokePricingPolicy({
        OPENAI_PROVIDER_MODE: "live",
        OPENAI_MODEL: "gpt-5-mini",
        OPENAI_PRICING_VERSION: "v1",
        OPENAI_INPUT_COST_MICRO_USD_PER_MILLION: "1",
        OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION: "0",
      }),
    ).toThrow(/Unsupported OPENAI_MODEL/);
    expect(() =>
      createLiveSmokePricingPolicy({
        OPENAI_PROVIDER_MODE: "live",
        OPENAI_MODEL: "gpt-5.6-luna",
        OPENAI_PRICING_VERSION: "v1",
        OPENAI_INPUT_COST_MICRO_USD_PER_MILLION: "0",
        OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION: "1",
      }),
    ).toThrow(/positive integer micro-USD rate/);
  });

  it("settles cached input as a subset and charges omitted detail conservatively", () => {
    const livePolicy = createLiveSmokePricingPolicy(controlledEnvironment)!;
    expect(
      calculateLiveSmokeCostMicroUsd(livePolicy, {
        inputUnits: 10,
        cachedInputUnits: 4,
        outputUnits: 2,
      }),
    ).toBe(19);
    expect(calculateLiveSmokeCostMicroUsd(livePolicy, { inputUnits: 10, outputUnits: 2 })).toBe(22);
    expect(() =>
      calculateLiveSmokeCostMicroUsd(livePolicy, {
        inputUnits: 3,
        cachedInputUnits: 4,
        outputUnits: 0,
      }),
    ).toThrow("LIVE_SMOKE_CACHED_INPUT_EXCEEDS_INPUT");
  });

  it("enforces the in-memory estimate boundary without a tokenizer request", () => {
    const policy = createLiveSmokePricingPolicy(controlledEnvironment)!;
    const estimate = estimateLiveSmokeInputTokens({
      messages: [{ role: "user", content: "synthetic" }],
      outputSchema: { type: "object" },
    });
    expect(estimate).toBeGreaterThan(0);
    expect(() => assertLiveSmokeInputEstimate(policy, 250000)).not.toThrow();
    expect(() => assertLiveSmokeInputEstimate(policy, 250001)).toThrow(
      "LIVE_SMOKE_ESTIMATED_INPUT_LIMIT_REACHED",
    );
    expect(() => assertLiveSmokeInputEstimate(policy, 0)).toThrow(
      "LIVE_SMOKE_INPUT_ESTIMATE_MISSING",
    );
  });
});
