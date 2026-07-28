import type { AgentResult } from "../../../../../packages/core/src/agents/agent-result.js";
import type { AgentCode } from "../../../../../packages/core/src/agents/prompt-registry.js";

export interface AIWorkerResult<T> {
  readonly status: "REVIEW_REQUIRED" | "COMPLETED" | "FAILED";
  readonly agentResult: AgentResult<T>;
  readonly persistedId?: string;
}
export function assertCompleted<T>(agentResult: AgentResult<T>): T {
  if (agentResult.status !== "COMPLETED" || agentResult.output === undefined)
    throw new Error(
      `AI agent ${agentResult.agentCode} did not complete: ${agentResult.errorCode ?? "unknown"}`,
    );
  return agentResult.output;
}
export function taskDefaults(
  agentCode: AgentCode,
  taskId: string,
  workspaceId: string,
  subjectId: string,
) {
  return {
    taskId,
    agentCode,
    workspaceId,
    subjectType: "CAMPAIGN",
    subjectId,
    correlationId: taskId,
  } as const;
}
