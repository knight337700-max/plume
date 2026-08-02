import OpenAI from "openai";
import { createHash } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- Docker compiles workspace source directly.
import { resolveLlmModel, type ProviderEvidence } from "../../../core/src/public.js";

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
  readonly onSdkRequestAttempt?: () => Promise<void> | void;
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
  readonly httpStatus?: number;
  readonly finishReason?: string;
  readonly providerRequestId?: string;
  readonly providerRequestIdHash?: string;
  readonly evidence?: ProviderEvidence;
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

const RESPONSES_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "anyOf",
  "$defs",
  "$ref",
  "description",
]);

function nullableResponsesSchema(value: unknown): unknown {
  if (!value || typeof value !== "object") return { anyOf: [value, { type: "null" }] };
  const schema = value as Record<string, unknown>;
  if (Array.isArray(schema.anyOf)) {
    if (schema.anyOf.some((item) => (item as Record<string, unknown>)?.type === "null"))
      return schema;
    return { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
  }
  if (Array.isArray(schema.type)) {
    if (schema.type.includes("null")) return schema;
    return { ...schema, type: [...schema.type, "null"] };
  }
  if (typeof schema.type === "string") return { ...schema, type: [schema.type, "null"] };
  if (Array.isArray(schema.enum)) {
    if (schema.enum.includes(null)) return schema;
    return { ...schema, enum: [...schema.enum, null] };
  }
  return { anyOf: [schema, { type: "null" }] };
}

export function normalizeResponsesSchema(value: unknown, path = "$"): unknown {
  if (Array.isArray(value))
    return value.map((child, index) => normalizeResponsesSchema(child, `${path}[${index}]`));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  if (
    source.type === "object" &&
    !source.properties &&
    source.additionalProperties !== undefined &&
    source.additionalProperties !== false
  )
    throw new Error(`OPENAI_STRICT_SCHEMA_UNSUPPORTED:${path}.additionalProperties`);
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (key === "const") {
      if (!Object.prototype.hasOwnProperty.call(normalized, "enum")) normalized.enum = [child];
      continue;
    }
    if (!RESPONSES_SCHEMA_KEYS.has(key)) continue;
    if ((key === "properties" || key === "$defs") && child && typeof child === "object") {
      normalized[key] = Object.fromEntries(
        Object.entries(child).map(([childKey, childValue]) => [
          childKey,
          normalizeResponsesSchema(childValue, `${path}.${key}.${childKey}`),
        ]),
      );
    } else {
      normalized[key] = normalizeResponsesSchema(child, `${path}.${key}`);
    }
  }
  if (source.properties && typeof source.properties === "object") {
    const properties = normalized.properties as Record<string, unknown>;
    normalized.properties = properties;
    normalized.required = Object.keys(properties);
    normalized.additionalProperties = false;
    const sourceRequired = new Set(
      Array.isArray(source.required)
        ? source.required.filter((item): item is string => typeof item === "string")
        : [],
    );
    for (const propertyName of Object.keys(properties)) {
      if (!sourceRequired.has(propertyName))
        properties[propertyName] = nullableResponsesSchema(properties[propertyName]);
    }
  } else if (normalized.type === "object") {
    normalized.additionalProperties = false;
  }
  return normalized;
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
        schema: normalizeResponsesSchema(request.outputSchema),
      },
    },
    max_output_tokens: 1200,
    reasoning: { effort: "none" },
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function requestIdHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeResponse(
  payload: ResponsePayload,
  model: string,
  startedAt: number,
  requestAttempted: boolean,
): AIExecutionResult {
  const text = outputText(payload);
  if (!text)
    return {
      provider: "OpenAI",
      model,
      status: "FAILED",
      latencyMs: Date.now() - startedAt,
      ...(payload.id ? { providerRequestIdHash: requestIdHash(payload.id) } : {}),
      evidence: {
        requestAttempted,
        responseReceived: true,
        ...(payload.id ? { requestIdHash: requestIdHash(payload.id) } : {}),
        resolvedModel: model,
        jsonParseStatus: "NOT_REACHED",
        ...(payload.usage?.input_tokens === undefined
          ? {}
          : { inputUnits: payload.usage.input_tokens }),
        ...(payload.usage?.output_tokens === undefined
          ? {}
          : { outputUnits: payload.usage.output_tokens }),
      },
      error: providerError(
        "INVALID_RESPONSE",
        "OpenAI response did not contain structured output",
        false,
      ),
    };
  try {
    const outputJson = JSON.parse(text);
    return {
      provider: "OpenAI",
      model,
      status: "COMPLETED",
      outputJson,
      latencyMs: Date.now() - startedAt,
      ...(payload.id ? { providerRequestIdHash: requestIdHash(payload.id) } : {}),
      evidence: {
        requestAttempted,
        responseReceived: true,
        ...(payload.id ? { requestIdHash: requestIdHash(payload.id) } : {}),
        resolvedModel: model,
        jsonParseStatus: "PASS",
        outputFingerprint: fingerprint(outputJson),
        outputLengthBytes: Buffer.byteLength(text, "utf8"),
        ...(payload.usage?.input_tokens === undefined
          ? {}
          : { inputUnits: payload.usage.input_tokens }),
        ...(payload.usage?.output_tokens === undefined
          ? {}
          : { outputUnits: payload.usage.output_tokens }),
      },
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
      ...(payload.id ? { providerRequestIdHash: requestIdHash(payload.id) } : {}),
      evidence: {
        requestAttempted,
        responseReceived: true,
        ...(payload.id ? { requestIdHash: requestIdHash(payload.id) } : {}),
        resolvedModel: model,
        jsonParseStatus: "FAIL",
        ...(payload.usage?.input_tokens === undefined
          ? {}
          : { inputUnits: payload.usage.input_tokens }),
        ...(payload.usage?.output_tokens === undefined
          ? {}
          : { outputUnits: payload.usage.output_tokens }),
      },
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
  if (environment.APP_ENV?.trim() === "production" && !environment.OPENAI_MODEL?.trim())
    throw new Error("OPENAI_MODEL is required in Production");
  const model = resolveLlmModel(environment.OPENAI_MODEL);
  const apiKey = environment.OPENAI_API_KEY?.trim();
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
      let sdkRequestAttempted = false;
      const markSdkRequestAttempt = async () => {
        await request.onSdkRequestAttempt?.();
        sdkRequestAttempted = true;
      };
      try {
        if (client) {
          await markSdkRequestAttempt();
          const response = await client.responses.create(requestBody(request, model) as never, {
            signal: controller.signal,
          });
          const normalized = normalizeResponse(
            response as unknown as ResponsePayload,
            model,
            startedAt,
            sdkRequestAttempted,
          );
          return {
            ...normalized,
            httpStatus: 200,
            ...(normalized.evidence
              ? { evidence: { ...normalized.evidence, httpStatus: 200 } }
              : {}),
          };
        }
        await markSdkRequestAttempt();
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
            httpStatus: 429,
            evidence: {
              requestAttempted: sdkRequestAttempted,
              responseReceived: true,
              httpStatus: 429,
              resolvedModel: model,
              jsonParseStatus: "NOT_REACHED",
            },
            error: providerError("RATE_LIMIT", "OpenAI rate limit", true, 429),
          };
        if (!response.ok)
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            httpStatus: response.status,
            evidence: {
              requestAttempted: sdkRequestAttempted,
              responseReceived: true,
              httpStatus: response.status,
              resolvedModel: model,
              jsonParseStatus: "NOT_REACHED",
            },
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
            httpStatus: response.status,
            evidence: {
              requestAttempted: sdkRequestAttempted,
              responseReceived: true,
              httpStatus: response.status,
              resolvedModel: model,
              jsonParseStatus: "FAIL",
            },
            error: providerError("INVALID_RESPONSE", "OpenAI response was not JSON", false),
          };
        }
        const normalized = normalizeResponse(payload, model, startedAt, sdkRequestAttempted);
        return {
          ...normalized,
          httpStatus: response.status,
          ...(normalized.evidence
            ? { evidence: { ...normalized.evidence, httpStatus: response.status } }
            : {}),
        };
      } catch (error) {
        const errorStatus =
          typeof error === "object" && error !== null && "status" in error
            ? Number(error.status)
            : undefined;
        const safeErrorStatus = Number.isInteger(errorStatus) ? errorStatus : undefined;
        if (controller.signal.aborted)
          return {
            provider: "OpenAI",
            model,
            status: "FAILED",
            latencyMs: Date.now() - startedAt,
            ...(safeErrorStatus === undefined ? {} : { httpStatus: safeErrorStatus }),
            evidence: {
              requestAttempted: sdkRequestAttempted,
              responseReceived: false,
              ...(safeErrorStatus === undefined ? {} : { httpStatus: safeErrorStatus }),
              resolvedModel: model,
              jsonParseStatus: "NOT_REACHED",
            },
            error: providerError("TIMEOUT", "OpenAI request timed out", true),
          };
        return {
          provider: "OpenAI",
          model,
          status: "FAILED",
          latencyMs: Date.now() - startedAt,
          ...(safeErrorStatus === undefined ? {} : { httpStatus: safeErrorStatus }),
          evidence: {
            requestAttempted: sdkRequestAttempted,
            responseReceived: false,
            ...(Number.isInteger(errorStatus) ? { httpStatus: errorStatus } : {}),
            resolvedModel: model,
            jsonParseStatus: "NOT_REACHED",
          },
          error: providerError(
            "PROVIDER_ERROR",
            "OpenAI request failed",
            safeErrorStatus !== undefined ? safeErrorStatus >= 500 : true,
            safeErrorStatus,
          ),
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}
