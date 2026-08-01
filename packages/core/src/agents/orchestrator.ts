import {
  buildAgentContext,
  type ContextBuilderInput,
  type ContextPackage,
} from "./context-builder.js";
import { modelPolicyRegistry, type ModelPolicyRegistry } from "./model-policy-registry.js";
import { promptRegistry, type PromptRegistry } from "./prompt-registry.js";
import { validateWithOneRepair, type JsonSchema } from "./result-repair.js";
import { createStrictOutputAdapter } from "./strict-output-adapter.js";
import { toolRegistry } from "./tool-registry.js";
import type { AgentResult } from "./agent-result.js";

interface ProviderRequest {
  readonly taskId: string;
  readonly modelPolicyId: string;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
  readonly outputSchema: JsonSchema;
  readonly imageInputs: readonly never[];
  readonly timeoutSeconds: number;
  readonly metadata: {
    readonly workspaceId: string;
    readonly agentCode: string;
    readonly promptVersion: string;
    readonly correlationId: string;
  };
}

interface ProviderResult {
  readonly status: "COMPLETED" | "FAILED";
  readonly model?: string;
  readonly outputJson?: unknown;
  readonly providerRequestId?: string;
  readonly latencyMs: number;
  readonly usage?: { readonly inputUnits: number; readonly outputUnits: number };
  readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
}

export interface AgentProviderGateway {
  execute(request: ProviderRequest): Promise<ProviderResult>;
}

export type ProviderCallKind = "initial" | "retry" | "repair";

export interface AgentOrchestratorOptions {
  readonly gateway: AgentProviderGateway;
  readonly prompts?: PromptRegistry;
  readonly policies?: ModelPolicyRegistry;
  /** Runs immediately before each provider call so durable budgets can reserve atomically. */
  readonly beforeProviderCall?: (kind: ProviderCallKind) => Promise<void>;
}
export interface AgentTaskInput extends Omit<ContextBuilderInput, "agentCode"> {
  readonly taskId: string;
  readonly agentCode: ContextBuilderInput["agentCode"];
  readonly correlationId: string;
  readonly messages: readonly {
    readonly role: "system" | "user" | "assistant";
    readonly content: string;
  }[];
  readonly outputSchema: JsonSchema;
  readonly requestedToolCodes?: readonly string[];
  readonly timeoutSeconds?: number;
}

export interface AgentSuccessHandler<T> {
  (output: T, context: ContextPackage, result: AgentResult<T>): Promise<void> | void;
}

export interface AgentOrchestrator {
  run<T = unknown>(
    input: AgentTaskInput,
    handler?: AgentSuccessHandler<T>,
  ): Promise<AgentResult<T>>;
}

function providerRequest(
  input: AgentTaskInput,
  context: ContextPackage,
  modelPolicyId: string,
  messages: AgentTaskInput["messages"],
  outputSchema: JsonSchema,
): ProviderRequest {
  return {
    taskId: input.taskId,
    modelPolicyId,
    messages,
    outputSchema,
    imageInputs: [],
    timeoutSeconds: input.timeoutSeconds ?? 30,
    metadata: {
      workspaceId: context.workspaceId,
      agentCode: input.agentCode,
      promptVersion: "1.0.0",
      correlationId: input.correlationId,
    },
  };
}

export function createAgentOrchestrator(options: AgentOrchestratorOptions): AgentOrchestrator {
  const prompts = options.prompts ?? promptRegistry;
  const policies = options.policies ?? modelPolicyRegistry;
  return {
    async run<T>(input: AgentTaskInput, handler?: AgentSuccessHandler<T>) {
      const prompt = prompts.resolve(input.agentCode);
      const policy = policies.forAgent(input.agentCode);
      for (const toolCode of input.requestedToolCodes ?? []) {
        if (!toolRegistry.canUse(input.agentCode, toolCode))
          throw new Error(`Unauthorized tool ${toolCode} for ${input.agentCode}`);
      }
      const context = buildAgentContext(input);
      const adapter = createStrictOutputAdapter<T>({
        schemaId: prompt.outputSchemaId,
        domainSchema: input.outputSchema,
      });
      const transitions: [
        "QUEUED",
        "RUNNING",
        ...("COMPLETED" | "FAILED" | "PERMANENT_FAILURE")[],
      ] = ["QUEUED", "RUNNING"];
      const started = Date.now();
      await options.beforeProviderCall?.("initial");
      let first = await options.gateway.execute(
        providerRequest(input, context, policy.policyId, input.messages, adapter.transportSchema),
      );
      let providerAttempts = 1;
      if (first.status === "FAILED" && first.error?.retryable) {
        await options.beforeProviderCall?.("retry");
        first = await options.gateway.execute(
          providerRequest(input, context, policy.policyId, input.messages, adapter.transportSchema),
        );
        providerAttempts = 2;
      }
      const baseMetadata = {
        promptId: prompt.promptId,
        promptVersion: prompt.version,
        promptHash: prompt.contentHash,
        modelPolicyId: policy.policyId,
        ...(first.model ? { model: first.model } : { model: policy.defaultModel }),
        contextHash: context.contentHash,
      };
      if (first.status !== "COMPLETED") {
        transitions.push("FAILED");
        return Object.freeze({
          taskId: input.taskId,
          workspaceId: context.workspaceId,
          agentCode: input.agentCode,
          status: "FAILED",
          errorCode: first.error?.code ?? "PROVIDER_ERROR",
          metadata: {
            ...baseMetadata,
            ...(first.providerRequestId ? { providerRequestId: first.providerRequestId } : {}),
            attempt: providerAttempts,
            latencyMs: first.latencyMs,
            ...(first.usage ? { usage: first.usage } : {}),
          },
          stateTransitions: transitions,
        });
      }
      const outcome = await validateWithOneRepair<T>({
        raw: first.outputJson,
        schema: input.outputSchema,
        decode: adapter.decode,
        repair: async ({ errorPaths }) => {
          const repairMessages = [
            ...input.messages,
            {
              role: "system" as const,
              content: `Repair only schema error paths: ${errorPaths.map((error) => error.path).join(", ")}`,
            },
          ];
          await options.beforeProviderCall?.("repair");
          const repaired = await options.gateway.execute(
            providerRequest(
              input,
              context,
              policy.policyId,
              repairMessages,
              adapter.transportSchema,
            ),
          );
          return repaired.status === "COMPLETED" ? repaired.outputJson : undefined;
        },
      });
      const metadata = {
        ...baseMetadata,
        ...(first.providerRequestId ? { providerRequestId: first.providerRequestId } : {}),
        attempt: providerAttempts + outcome.repairAttempts,
        latencyMs: Date.now() - started,
        ...(first.usage ? { usage: first.usage } : {}),
      };
      if (outcome.status !== "SUCCESS") {
        transitions.push("PERMANENT_FAILURE");
        return Object.freeze({
          taskId: input.taskId,
          workspaceId: context.workspaceId,
          agentCode: input.agentCode,
          status: "PERMANENT_FAILURE",
          errorCode: "SCHEMA_VALIDATION_FAILED",
          metadata,
          stateTransitions: transitions,
        });
      }
      const result = Object.freeze({
        taskId: input.taskId,
        workspaceId: context.workspaceId,
        agentCode: input.agentCode,
        status: "COMPLETED" as const,
        output: outcome.value,
        metadata,
        stateTransitions: [...transitions, "COMPLETED"] as ["QUEUED", "RUNNING", "COMPLETED"],
      });
      if (handler) await handler(outcome.value, context, result);
      return result;
    },
  };
}
