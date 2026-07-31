import OpenAI from "openai";

export interface SafeMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content:
    | string
    | readonly { readonly type: string; readonly text?: string; readonly imageUrl?: string }[];
}

export interface FileReference {
  readonly fileId: string;
  readonly mimeType: string;
  readonly bytes?: Uint8Array;
}

export interface AIExecutionRequest {
  readonly taskId: string;
  readonly modelPolicyId: string;
  readonly messages: readonly SafeMessage[];
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly imageInputs: readonly FileReference[];
  readonly timeoutSeconds: number;
  readonly metadata: {
    readonly workspaceId: string;
    readonly agentCode: string;
    readonly promptVersion: string;
    readonly correlationId: string;
  };
}

export type AIExecutionErrorCode = "RATE_LIMIT" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_RESPONSE";
export interface AIExecutionError {
  readonly code: AIExecutionErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
}
export interface AIExecutionResult {
  readonly provider: "OpenAI";
  readonly model: string;
  readonly status: "COMPLETED" | "FAILED";
  readonly outputJson?: unknown;
  readonly usage?: {
    readonly inputUnits: number;
    readonly outputUnits: number;
    readonly costMicros?: number;
  };
  readonly latencyMs: number;
  readonly finishReason?: string;
  readonly providerRequestId?: string;
  readonly safetyMetadata?: Readonly<Record<string, unknown>>;
  readonly error?: AIExecutionError;
}

interface ResponsePayload {
  readonly id?: string;
  readonly status?: string;
  readonly output_text?: string;
  readonly output?: readonly {
    readonly content?: readonly { readonly text?: string; readonly type?: string }[];
  }[];
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
  readonly incomplete_details?: { readonly reason?: string };
}

export interface OpenAIProviderGatewayOptions {
  readonly client?: OpenAI;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

const RESPONSE_METADATA = {
  environment: "staging",
  gate: "H_PHASE_2C",
  customer_data: "synthetic",
} as const;

function inputText(messages: readonly SafeMessage[]): string {
  return messages
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map((part) => part.text ?? "").join("\n");
      return `${message.role}: ${content}`;
    })
    .join("\n\n");
}

function requestBody(request: AIExecutionRequest, model: string): Record<string, unknown> {
  return {
    model,
    input: inputText(request.messages),
    text: {
      format: {
        type: "json_schema",
        name: `${request.metadata.agentCode.toLowerCase()}_result`,
        strict: true,
        schema: request.outputSchema,
      },
    },
    max_output_tokens: 1200,
    store: false,
    background: false,
    metadata: RESPONSE_METADATA,
  };
}

function providerError(
  code: AIExecutionErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AIExecutionError {
  return { code, message, retryable, ...(status === undefined ? {} : { status }) };
}

function outputText(payload: ResponsePayload): string | undefined {
  if (payload.output_text) return payload.output_text;
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((part) => part.type === "output_text" || part.text)?.text;
}

function normalizeResponse(
  payload: ResponsePayload,
  model: string,
  startedAt: number,
): AIExecutionResult {
  const text = outputText(payload);
  if (!text)
    return {
      provider: "OpenAI",
      model,
      status: "FAILED",
      latencyMs: Date.now() - startedAt,
      ...(payload.id ? { providerRequestId: payload.id } : {}),
      error: providerError(
        "INVALID_RESPONSE",
        "OpenAI response did not contain structured output",
        false,
      ),
    };
  try {
    return {
      provider: "OpenAI",
      model,
      status: "COMPLETED",
      outputJson: JSON.parse(text),
      latencyMs: Date.now() - startedAt,
      ...(payload.id ? { providerRequestId: payload.id } : {}),
      ...((payload.incomplete_details?.reason ?? payload.status)
        ? { finishReason: payload.incomplete_details?.reason ?? payload.status }
        : {}),
      ...(payload.usage
        ? {
            usage: {
              inputUnits: payload.usage.input_tokens ?? 0,
              outputUnits: payload.usage.output_tokens ?? 0,
            },
          }
        : {}),
    };
  } catch {
    return {
      provider: "OpenAI",
      model,
      status: "FAILED",
      latencyMs: Date.now() - startedAt,
      ...(payload.id ? { providerRequestId: payload.id } : {}),
      error: providerError(
        "INVALID_RESPONSE",
        "OpenAI structured output was not valid JSON",
        false,
      ),
    };
  }
}

export interface OpenAIProviderGateway {
  execute(request: AIExecutionRequest, signal?: AbortSignal): Promise<AIExecutionResult>;
}

export function createOpenAIProviderGateway(
  options: OpenAIProviderGatewayOptions = {},
): OpenAIProviderGateway {
  const environment = options.environment ?? process.env;
  const model = environment.OPENAI_DEFAULT_MODEL?.trim();
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!model) throw new Error("OPENAI_DEFAULT_MODEL is required");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  const requestFetch = options.fetchImpl ?? fetch;
  const endpoint = (options.endpoint ?? "https://api.openai.com/v1/responses").replace(/\/$/u, "");
  const client = options.fetchImpl || options.client ? options.client : new OpenAI({ apiKey });
  return {
    async execute(request, signal) {
      if (request.imageInputs.length)
        return {
          provider: "OpenAI",
          model,
          status: "FAILED",
          latencyMs: 0,
          error: providerError("PROVIDER_ERROR", "Image inputs are disabled for Phase 2C", false),
        };
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, request.timeoutSeconds) * 1000,
      );
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        if (client) {
          const response = await client.responses.create(requestBody(request, model) as never, {
            signal: controller.signal,
          });
          return normalizeResponse(response as unknown as ResponsePayload, model, startedAt);
        }
        const response = await requestFetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(requestBody(request, model)),
          signal: controller.signal,
        });
        if (response.status === 429)
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            error: providerError("RATE_LIMIT", "OpenAI rate limit", true, 429),
          };
        if (!response.ok)
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            error: providerError(
              "PROVIDER_ERROR",
              `OpenAI provider error (${response.status})`,
              response.status >= 500,
              response.status,
            ),
          };
        let payload: ResponsePayload;
        try {
          payload = (await response.json()) as ResponsePayload;
        } catch {
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            error: providerError("INVALID_RESPONSE", "OpenAI response was not JSON", false),
          };
        }
        return normalizeResponse(payload, model, startedAt);
      } catch (error) {
        if (controller.signal.aborted)
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            error: providerError("TIMEOUT", "OpenAI request timed out", true),
          };
        return {
          provider: "OpenAI",
          model,
          status: "FAILED",
          latencyMs: Date.now() - startedAt,
          error: providerError(
            "PROVIDER_ERROR",
            "OpenAI request failed",
            typeof error === "object" && error !== null && "status" in error
              ? Number(error.status) >= 500
              : true,
            typeof error === "object" && error !== null && "status" in error
              ? Number(error.status)
              : undefined,
          ),
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}
