import { createAgentOrchestrator, type AgentOrchestrator } from "../../../packages/core/src/public.js";
import {
  createOpenAIProviderRuntime,
  type ProviderRuntime,
  type ProviderRuntimeOptions,
} from "../../../packages/infrastructure/src/ai/provider-runtime.js";

export interface WorkerAIRuntime {
  readonly provider: ProviderRuntime;
  readonly orchestrator: AgentOrchestrator;
}

export function createWorkerAIRuntime(options: ProviderRuntimeOptions = {}): WorkerAIRuntime {
  const provider = createOpenAIProviderRuntime(options);
  return {
    provider,
    orchestrator: createAgentOrchestrator({ gateway: provider.gateway }),
  };
}
