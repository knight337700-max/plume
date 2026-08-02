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
import type { ValidationEvidence } from "./result-validator.js";

export type ProviderEvidenceStatus = "PASS" | "FAIL" | "NOT_REACHED";

export interface ProviderEvidence {
  readonly requestAttempted: boolean;
  readonly responseReceived: boolean;
  readonly httpStatus?: number | undefined;
  readonly requestIdHash?: string | undefined;
  readonly resolvedModel?: string | undefined;
  readonly jsonParseStatus: ProviderEvidenceStatus;
  readonly outputFingerprint?: string | undefined;
  readonly outputLengthBytes?: number | undefined;
  readonly inputUnits?: number | undefined;
  readonly outputUnits?: number | undefined;
}

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
  readonly onSdkRequestAttempt?: () => Promise<void> | void;
  readonly metadata: {
    readonly workspaceId: string;
    readonly agentCode: string;
    readonly promptVersion: string;
    readonly correlationId: string;
  };
}

export interface ProviderResult {
  readonly status: "COMPLETED" | "FAILED";
  readonly model?: string;
  readonly outputJson?: unknown;
  readonly providerRequestId?: string;
  readonly providerRequestIdHash?: string;
  readonly latencyMs: number;
  readonly httpStatus?: number;
  readonly usage?: { readonly inputUnits: number; readonly outputUnits: number };
  readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
  readonly evidence?: ProviderEvidence;
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
  readonly retryEnabled?: boolean;
  readonly repairEnabled?: boolean;
  /** Runs immediately after a provider result is received. */
  readonly afterProviderCall?: (kind: ProviderCallKind, result: ProviderResult) => Promise<void>;
  /** Runs after the returned output is validated, without receiving raw output. */
  readonly afterProviderValidation?: (
    kind: ProviderCallKind,
    result: ProviderResult,
    evidence?: ValidationEvidence,
  ) => Promise<void>;
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
  /** Called by the provider gateway at the SDK method invocation boundary. */
  readonly onSdkRequestAttempt?: (kind: ProviderCallKind) => Promise<void> | void;
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
  callKind: ProviderCallKind,
): ProviderRequest {
  return {
    taskId: input.taskId,
    modelPolicyId,
    messages,
    outputSchema,
    imageInputs: [],
    timeoutSeconds: input.timeoutSeconds ?? 30,
    ...(input.onSdkRequestAttempt
      ? { onSdkRequestAttempt: () => input.onSdkRequestAttempt!(callKind) }
      : {}),
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
        context: context.data,
      });
      const transitions: [
        "QUEUED",
        "RUNNING",
        ...("COMPLETED" | "FAILED" | "PERMANENT_FAILURE")[],
      ] = ["QUEUED", "RUNNING"];
      const started = Date.now();
      await options.beforeProviderCall?.("initial");
      let first = await options.gateway.execute(
        providerRequest(
          input,
          context,
          policy.policyId,
          input.messages,
          adapter.transportSchema,
          "initial",
        ),
      );
      await options.afterProviderCall?.("initial", first);
      let providerAttempts = 1;
      if (options.retryEnabled !== false && first.status === "FAILED" && first.error?.retryable) {
        await options.beforeProviderCall?.("retry");
        first = await options.gateway.execute(
          providerRequest(
            input,
            context,
            policy.policyId,
            input.messages,
            adapter.transportSchema,
            "retry",
          ),
        );
        await options.afterProviderCall?.("retry", first);
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
            ...(first.evidence?.requestIdHash || first.providerRequestIdHash
              ? {
                  providerRequestIdHash:
                    first.evidence?.requestIdHash ?? first.providerRequestIdHash,
                }
              : {}),
            attempt: providerAttempts,
            latencyMs: first.latencyMs,
            ...(first.usage ? { usage: first.usage } : {}),
          },
          stateTransitions: transitions,
        });
      }
      const validationKind: ProviderCallKind = providerAttempts === 2 ? "retry" : "initial";
      let validationProviderResult = first;
      const outcome = await validateWithOneRepair<T>({
        raw: first.outputJson,
        schema: input.outputSchema,
        decode: adapter.decode,
        onValidation: async (phase, validation) => {
          await options.afterProviderValidation?.(
            phase === "repair" ? "repair" : validationKind,
            validationProviderResult,
            validation.evidence,
          );
        },
        ...(options.repairEnabled === false
          ? {}
          : {
              repair: async ({
                errorPaths,
              }: {
                readonly errorPaths: readonly { readonly path: string }[];
              }) => {
                const repairMessages = [
                  ...input.messages,
                  {
                    role: "system" as const,
                    content: `Repair only schema error paths: ${errorPaths
                      .map((error) => error.path)
                      .join(", ")}`,
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
                    "repair",
                  ),
                );
                validationProviderResult = repaired;
                await options.afterProviderCall?.("repair", repaired);
                return repaired.status === "COMPLETED" ? repaired.outputJson : undefined;
              },
            }),
      });
      const metadata = {
        ...baseMetadata,
        ...(first.evidence?.requestIdHash || first.providerRequestIdHash
          ? {
              providerRequestIdHash: first.evidence?.requestIdHash ?? first.providerRequestIdHash,
            }
          : {}),
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
