export const LIVE_SMOKE_DIAGNOSTIC_PLAN_ID = "CANARY_PLUS_CAMPAIGN_ANALYST_DIAGNOSTIC_V1" as const;

export interface LiveSmokeDiagnosticPlan {
  readonly planId: typeof LIVE_SMOKE_DIAGNOSTIC_PLAN_ID;
  readonly canary: 1;
  readonly initialAgents: readonly ["CAMPAIGN_ANALYST"];
  readonly otherAgents: readonly [];
  readonly maximumRetryCalls: 1;
  readonly maximumRepairCalls: 1;
  readonly absoluteProviderCallCap: 4;
  readonly concurrency: 1;
  readonly softStopMicroUsd: 250_000;
  readonly hardCapMicroUsd: 750_000;
  readonly safetyBufferMicroUsd: 250_000;
  readonly effectiveHardCapMicroUsd: 500_000;
  readonly monthlyLimitMicroUsd: 5_000_000;
  readonly r3CarryForwardMicroUsd: 1_500_000;
}

const DIAGNOSTIC_PLAN: LiveSmokeDiagnosticPlan = Object.freeze({
  planId: LIVE_SMOKE_DIAGNOSTIC_PLAN_ID,
  canary: 1,
  initialAgents: ["CAMPAIGN_ANALYST"] as const,
  otherAgents: [] as const,
  maximumRetryCalls: 1,
  maximumRepairCalls: 1,
  absoluteProviderCallCap: 4,
  concurrency: 1,
  softStopMicroUsd: 250_000,
  hardCapMicroUsd: 750_000,
  safetyBufferMicroUsd: 250_000,
  effectiveHardCapMicroUsd: 500_000,
  monthlyLimitMicroUsd: 5_000_000,
  r3CarryForwardMicroUsd: 1_500_000,
});

export function resolveLiveSmokeDiagnosticPlan(planId: string): LiveSmokeDiagnosticPlan {
  if (planId !== LIVE_SMOKE_DIAGNOSTIC_PLAN_ID)
    throw new Error("LIVE_SMOKE_DIAGNOSTIC_PLAN_UNKNOWN");
  return DIAGNOSTIC_PLAN;
}

export function assertDiagnosticAgentAllowed(
  plan: LiveSmokeDiagnosticPlan,
  agentCode: string,
): void {
  if (!plan.initialAgents.includes(agentCode as "CAMPAIGN_ANALYST"))
    throw new Error("LIVE_SMOKE_DIAGNOSTIC_AGENT_NOT_ALLOWED");
}
