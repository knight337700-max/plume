import type { AgentCode } from "./prompt-registry.js";

export type AgentResultStatus = "COMPLETED" | "FAILED" | "PERMANENT_FAILURE";

export interface AgentResultMetadata {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly promptHash: string;
  readonly modelPolicyId: string;
  readonly model?: string;
  readonly contextHash: string;
  readonly providerRequestIdHash?: string;
  readonly attempt: number;
  readonly latencyMs: number;
  readonly usage?: {
    readonly inputUnits: number;
    readonly cachedInputUnits?: number;
    readonly outputUnits: number;
  };
}

export interface AgentResult<T = unknown> {
  readonly taskId: string;
  readonly workspaceId: string;
  readonly agentCode: AgentCode;
  readonly status: AgentResultStatus;
  readonly output?: T;
  readonly errorCode?: string;
  readonly metadata: AgentResultMetadata;
  readonly stateTransitions: readonly [
    "QUEUED",
    "RUNNING",
    ...("COMPLETED" | "FAILED" | "PERMANENT_FAILURE")[],
  ];
}
