// eslint-disable-next-line no-restricted-imports -- Docker compiles workspace source directly.
import { resolveLlmModel, type AgentProviderGateway } from "../../../core/src/public.js";
import {
  createOpenAIProviderGateway,
  type OpenAIProviderGateway,
  type OpenAIProviderGatewayOptions,
} from "./openai-gateway.js";
import { createDeterministicMockProviderGateway } from "./mock-provider.js";

export type OpenAIProviderMode = "mock" | "live";

export interface ProviderRuntimeOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly mockGateway?: OpenAIProviderGateway;
  readonly liveGateway?: OpenAIProviderGateway;
  readonly liveGatewayOptions?: OpenAIProviderGatewayOptions;
}

export interface ProviderRuntime {
  readonly mode: OpenAIProviderMode;
  readonly gateway: AgentProviderGateway;
}

function asAgentGateway(gateway: OpenAIProviderGateway): AgentProviderGateway {
  return {
    async execute(request) {
      const result = await gateway.execute({
        ...request,
        outputSchema: request.outputSchema as Readonly<Record<string, unknown>>,
        imageInputs: [],
      });
      return {
        status: result.status,
        ...(result.model ? { model: result.model } : {}),
        ...(result.outputJson === undefined ? {} : { outputJson: result.outputJson }),
        ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
        ...(result.providerRequestIdHash
          ? { providerRequestIdHash: result.providerRequestIdHash }
          : {}),
        latencyMs: result.latencyMs,
        ...(result.httpStatus === undefined ? {} : { httpStatus: result.httpStatus }),
        ...(result.usage ? { usage: result.usage } : {}),
        ...(result.evidence ? { evidence: result.evidence } : {}),
        ...(result.error
          ? {
              error: {
                code: result.error.code,
                message: result.error.message,
                retryable: result.error.retryable,
              },
            }
          : {}),
      };
    },
  };
}

function providerMode(
  environment: Readonly<Record<string, string | undefined>>,
): OpenAIProviderMode {
  const production = environment.APP_ENV?.trim() === "production";
  const configured = environment.OPENAI_PROVIDER_MODE?.trim();
  if (production && !configured) throw new Error("OPENAI_PROVIDER_MODE is required in Production");
  const mode = configured || "mock";
  if (mode !== "mock" && mode !== "live")
    throw new Error("OPENAI_PROVIDER_MODE must be mock or live");
  return mode;
}

export function createOpenAIProviderRuntime(options: ProviderRuntimeOptions = {}): ProviderRuntime {
  const environment = options.environment ?? process.env;
  const mode = providerMode(environment);
  const production = environment.APP_ENV?.trim() === "production";
  if (production && !environment.OPENAI_MODEL?.trim())
    throw new Error("OPENAI_MODEL is required in Production");
  if (mode === "mock") {
    return {
      mode,
      gateway: asAgentGateway(options.mockGateway ?? createDeterministicMockProviderGateway()),
    };
  }
  if (!environment.OPENAI_API_KEY?.trim())
    throw new Error("OPENAI_API_KEY is required in live provider mode");
  if (production && environment.OPENAI_LIVE_APPROVED?.trim() !== "true")
    throw new Error("OPENAI_LIVE_APPROVED must be true before Production Live mode");
  if (production && environment.OPENAI_MAX_CONCURRENCY?.trim() !== "1")
    throw new Error("OPENAI_MAX_CONCURRENCY must be 1 for the initial Production policy");
  if (
    production &&
    (!environment.OPENAI_MONTHLY_BUDGET_USD?.trim() ||
      !environment.OPENAI_SOFT_STOP_USD?.trim() ||
      !environment.OPENAI_HARD_STOP_USD?.trim())
  )
    throw new Error("Production Live budget guardrails are required");
  resolveLlmModel(environment.OPENAI_MODEL);
  const gateway =
    options.liveGateway ??
    createOpenAIProviderGateway({
      ...options.liveGatewayOptions,
      environment,
    });
  return { mode, gateway: asAgentGateway(gateway) };
}
