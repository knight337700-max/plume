import { describe, expect, it } from "vitest";
import {
  calculateLiveSmokeCostMicroUsd,
  calculateLiveSmokeReservationMicroUsd,
  createLiveSmokePricingPolicy,
} from "./live-smoke-spend-policy.js";

const policy = {
  model: "gpt-5.6-luna",
  pricingVersion: "test-v1",
  inputMicroUsdPerMillionTokens: 2_000_000,
  outputMicroUsdPerMillionTokens: 4_000_000,
} as const;

describe("durable live smoke spend policy", () => {
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
});
