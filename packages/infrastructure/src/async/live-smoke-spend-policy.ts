import { resolveLlmModel } from "@plume/core/src/public.js";

const MICRO_USD_PER_MILLION_TOKENS = 1_000_000;

export interface LiveSmokePricingPolicy {
  readonly model: string;
  readonly pricingVersion: string;
  readonly inputMicroUsdPerMillionTokens: number;
  readonly outputMicroUsdPerMillionTokens: number;
}

function requiredPositiveInteger(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): number {
  const raw = environment[key]?.trim();
  if (!raw) throw new Error(`${key} is required for live provider spend accounting`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${key} must be a positive integer micro-USD rate`);
  return value;
}

export function createLiveSmokePricingPolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LiveSmokePricingPolicy | undefined {
  if (environment.OPENAI_PROVIDER_MODE?.trim() !== "live") return undefined;
  const configuredModel = environment.OPENAI_MODEL?.trim();
  if (!configuredModel)
    throw new Error("OPENAI_MODEL is required for live provider spend accounting");
  const pricingVersion = environment.OPENAI_PRICING_VERSION?.trim();
  if (!pricingVersion)
    throw new Error("OPENAI_PRICING_VERSION is required for live provider spend accounting");
  return Object.freeze({
    model: resolveLlmModel(configuredModel),
    pricingVersion,
    inputMicroUsdPerMillionTokens: requiredPositiveInteger(
      environment,
      "OPENAI_INPUT_COST_MICRO_USD_PER_MILLION",
    ),
    outputMicroUsdPerMillionTokens: requiredPositiveInteger(
      environment,
      "OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION",
    ),
  });
}

function assertTokenCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${field} must be a non-negative integer`);
}

function costForTokens(tokens: number, microUsdPerMillionTokens: number): number {
  assertTokenCount(tokens, "tokens");
  const product = tokens * microUsdPerMillionTokens;
  if (!Number.isSafeInteger(product)) throw new Error("LIVE_SMOKE_COST_OVERFLOW");
  return Math.ceil(product / MICRO_USD_PER_MILLION_TOKENS);
}

export function calculateLiveSmokeCostMicroUsd(
  policy: LiveSmokePricingPolicy,
  usage: { readonly inputUnits: number; readonly outputUnits: number },
): number {
  const input = costForTokens(usage.inputUnits, policy.inputMicroUsdPerMillionTokens);
  const output = costForTokens(usage.outputUnits, policy.outputMicroUsdPerMillionTokens);
  const total = input + output;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("LIVE_SMOKE_COST_OVERFLOW");
  return total;
}

export function calculateLiveSmokeReservationMicroUsd(
  policy: LiveSmokePricingPolicy,
  maxInputUnits: number,
  maxOutputUnits: number,
): number {
  return calculateLiveSmokeCostMicroUsd(policy, {
    inputUnits: maxInputUnits,
    outputUnits: maxOutputUnits,
  });
}
