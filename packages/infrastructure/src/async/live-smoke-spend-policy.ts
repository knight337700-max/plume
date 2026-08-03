import { resolveLlmModel } from "@plume/core/src/public.js";

const MICRO_USD_PER_MILLION_TOKENS = 1_000_000;

export interface LiveSmokePricingPolicy {
  readonly model: string;
  readonly pricingVersion: string;
  readonly inputMicroUsdPerMillionTokens: number;
  readonly outputMicroUsdPerMillionTokens: number;
  /** Cached input is a subset of input_tokens; omitted provider detail is charged conservatively. */
  readonly cachedInputMicroUsdPerMillionTokens?: number;
  readonly maxEstimatedInputTokens?: number;
  readonly perRunSoftStopMicroUsd?: number;
  readonly perRunHardCapMicroUsd?: number;
  readonly monthlyLimitMicroUsd?: number;
  readonly safetyBufferMicroUsd?: number;
  readonly absoluteProviderCallCap?: number;
  readonly billingScope?: string;
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

function requiredNonEmpty(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required for live provider spend accounting`);
  return value;
}

function assertRuntimeLimitRelations(policy: LiveSmokePricingPolicy): void {
  const values = [
    policy.cachedInputMicroUsdPerMillionTokens,
    policy.maxEstimatedInputTokens,
    policy.perRunSoftStopMicroUsd,
    policy.perRunHardCapMicroUsd,
    policy.monthlyLimitMicroUsd,
    policy.safetyBufferMicroUsd,
    policy.absoluteProviderCallCap,
  ];
  if (values.some((value) => value === undefined))
    throw new Error("LIVE_SMOKE_RUNTIME_SPEND_POLICY_INCOMPLETE");
  if (
    policy.perRunSoftStopMicroUsd! >= policy.perRunHardCapMicroUsd! ||
    policy.perRunHardCapMicroUsd! >= policy.monthlyLimitMicroUsd! ||
    policy.safetyBufferMicroUsd! >= policy.perRunHardCapMicroUsd! ||
    policy.absoluteProviderCallCap! < 1 ||
    policy.absoluteProviderCallCap! > 20
  )
    throw new Error("LIVE_SMOKE_RUNTIME_SPEND_POLICY_RELATION_INVALID");
  if (!policy.billingScope?.trim()) throw new Error("OPENAI_LIVE_BILLING_SCOPE is required");
}

export function createLiveSmokePricingPolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LiveSmokePricingPolicy | undefined {
  if (environment.OPENAI_PROVIDER_MODE?.trim() !== "live") return undefined;
  const configuredModel = environment.OPENAI_MODEL?.trim();
  if (!configuredModel)
    throw new Error("OPENAI_MODEL is required for live provider spend accounting");
  const pricingVersion = requiredNonEmpty(environment, "OPENAI_PRICING_VERSION");
  const policy = {
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
    cachedInputMicroUsdPerMillionTokens: requiredPositiveInteger(
      environment,
      "OPENAI_CACHED_INPUT_COST_MICRO_USD_PER_MILLION",
    ),
    maxEstimatedInputTokens: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_MAX_ESTIMATED_INPUT_TOKENS",
    ),
    perRunSoftStopMicroUsd: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_PER_RUN_SOFT_STOP_MICRO_USD",
    ),
    perRunHardCapMicroUsd: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_PER_RUN_HARD_CAP_MICRO_USD",
    ),
    monthlyLimitMicroUsd: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_MONTHLY_LIMIT_MICRO_USD",
    ),
    safetyBufferMicroUsd: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_SAFETY_BUFFER_MICRO_USD",
    ),
    absoluteProviderCallCap: requiredPositiveInteger(
      environment,
      "OPENAI_LIVE_ABSOLUTE_PROVIDER_CALL_CAP",
    ),
    billingScope: requiredNonEmpty(environment, "OPENAI_LIVE_BILLING_SCOPE"),
  } satisfies LiveSmokePricingPolicy;
  assertRuntimeLimitRelations(policy);
  return Object.freeze(policy);
}

function assertTokenCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${field} must be a non-negative integer`);
}

function costForTokens(tokens: number, microUsdPerMillionTokens: number): number {
  assertTokenCount(tokens, "tokens");
  if (!Number.isSafeInteger(microUsdPerMillionTokens) || microUsdPerMillionTokens <= 0)
    throw new Error("LIVE_SMOKE_COST_RATE_INVALID");
  const product = BigInt(tokens) * BigInt(microUsdPerMillionTokens);
  const amount =
    (product + BigInt(MICRO_USD_PER_MILLION_TOKENS - 1)) / BigInt(MICRO_USD_PER_MILLION_TOKENS);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("LIVE_SMOKE_COST_OVERFLOW");
  return Number(amount);
}

export function calculateLiveSmokeCostMicroUsd(
  policy: LiveSmokePricingPolicy,
  usage: {
    readonly inputUnits: number;
    readonly cachedInputUnits?: number;
    readonly outputUnits: number;
  },
): number {
  const cached = usage.cachedInputUnits ?? 0;
  assertTokenCount(cached, "cachedInputUnits");
  if (cached > usage.inputUnits) throw new Error("LIVE_SMOKE_CACHED_INPUT_EXCEEDS_INPUT");
  const uncached = usage.inputUnits - cached;
  const input =
    costForTokens(uncached, policy.inputMicroUsdPerMillionTokens) +
    costForTokens(
      cached,
      policy.cachedInputMicroUsdPerMillionTokens ?? policy.inputMicroUsdPerMillionTokens,
    );
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

/**
 * Estimates the exact in-memory Responses request envelope without a network
 * tokenizer call. The estimate is deliberately conservative at four UTF-8
 * bytes per token and is checked before durable reservation.
 */
export function estimateLiveSmokeInputTokens(input: {
  readonly messages: readonly { readonly role: string; readonly content: unknown }[];
  readonly outputSchema: unknown;
  readonly metadata?: unknown;
}): number {
  let serialized: string;
  try {
    serialized = JSON.stringify({
      input: input.messages,
      text: { format: { schema: input.outputSchema } },
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    });
  } catch {
    throw new Error("LIVE_SMOKE_INPUT_ESTIMATE_INVALID");
  }
  if (!serialized) throw new Error("LIVE_SMOKE_INPUT_ESTIMATE_MISSING");
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (!Number.isSafeInteger(bytes) || bytes < 1)
    throw new Error("LIVE_SMOKE_INPUT_ESTIMATE_INVALID");
  return Math.max(1, Math.ceil(bytes / 4));
}

export function assertLiveSmokeInputEstimate(
  policy: LiveSmokePricingPolicy,
  estimate: number,
): void {
  if (!Number.isSafeInteger(estimate) || estimate < 1)
    throw new Error("LIVE_SMOKE_INPUT_ESTIMATE_MISSING");
  if (policy.maxEstimatedInputTokens !== undefined && estimate > policy.maxEstimatedInputTokens)
    throw new Error("LIVE_SMOKE_ESTIMATED_INPUT_LIMIT_REACHED");
}

export function assertLiveSmokeRuntimePolicy(policy: LiveSmokePricingPolicy): void {
  assertRuntimeLimitRelations(policy);
}
