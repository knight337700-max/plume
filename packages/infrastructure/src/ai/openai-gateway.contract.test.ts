import { describe, expect, it } from "vitest";
import { createOpenAIProviderGateway, normalizeResponsesSchema } from "./openai-gateway.js";

const request = {
  taskId: "task-1",
  modelPolicyId: "balanced-structured-v1",
  messages: [{ role: "user" as const, content: "Return the candidate JSON." }],
  outputSchema: { type: "object", required: ["items"] },
  imageInputs: [],
  timeoutSeconds: 2,
  metadata: {
    workspaceId: "workspace-1",
    agentCode: "PRODUCT_MATCHER",
    promptVersion: "1.0.0",
    correlationId: "corr-1",
  },
};

describe("OpenAI provider gateway", () => {
  it("sends structured output with the configured model and normalizes the response", async () => {
    let receivedBody: Record<string, unknown> | undefined;
    let sdkAttempted = false;
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "test-secret" },
      fetchImpl: async (_url, init) => {
        receivedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-secret");
        return new Response(
          JSON.stringify({
            id: "req-1",
            status: "completed",
            output_text: '{"items":[{"id":"p1"}]}',
            usage: { input_tokens: 4, output_tokens: 2 },
          }),
          { status: 200 },
        );
      },
    });
    const result = await gateway.execute({
      ...request,
      onSdkRequestAttempt: () => {
        sdkAttempted = true;
      },
    });
    expect(sdkAttempted).toBe(true);
    expect(receivedBody?.model).toBe("gpt-5.6-luna");
    expect(
      (receivedBody?.text as { format: { type: string; strict: boolean } }).format,
    ).toMatchObject({ type: "json_schema", strict: true });
    expect(receivedBody?.store).toBe(false);
    expect(receivedBody?.background).toBe(false);
    expect(receivedBody?.reasoning).toEqual({ effort: "none" });
    expect(receivedBody?.metadata).toEqual({
      environment: "staging",
      gate: "H_PHASE_2C",
      customer_data: "synthetic",
    });
    expect(result).toMatchObject({
      provider: "OpenAI",
      model: "gpt-5.6-luna",
      status: "COMPLETED",
      providerRequestIdHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      outputJson: { items: [{ id: "p1" }] },
    });
    expect(result.evidence).toMatchObject({
      requestAttempted: true,
      responseReceived: true,
      httpStatus: 200,
      resolvedModel: "gpt-5.6-luna",
      jsonParseStatus: "PASS",
    });
    expect(JSON.stringify(result)).not.toContain("req-1");
  });

  it("normalizes JSON Schema const keywords for Responses strict schemas", async () => {
    let receivedBody: Record<string, unknown> | undefined;
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "test-secret" },
      fetchImpl: async (_url, init) => {
        receivedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ id: "req-const", status: "completed", output_text: '{"status":"ok"}' }),
          { status: 200 },
        );
      },
    });
    await gateway.execute({
      ...request,
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string", const: "ok" },
          optional: { type: "string", minLength: 1, format: "uuid" },
        },
        required: ["status"],
        additionalProperties: true,
      },
    });
    const schema = (
      receivedBody?.text as {
        format: { schema: { properties: { status: Record<string, unknown> } } };
      }
    ).format.schema;
    expect(schema.properties.status).toEqual({ type: "string", enum: ["ok"] });
    expect(schema.properties.optional).toEqual({ type: ["string", "null"] });
    expect(schema.required).toEqual(["status", "optional"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("reports the exact path for a schema-valued dynamic map", () => {
    expect(() =>
      normalizeResponsesSchema({
        type: "object",
        properties: {
          slots: { type: "object", additionalProperties: { type: "string" } },
        },
      }),
    ).toThrow("OPENAI_STRICT_SCHEMA_UNSUPPORTED:$.properties.slots.additionalProperties");
  });

  it("maps rate limits and timeout without exposing credentials", async () => {
    const rateLimited = createOpenAIProviderGateway({
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "secret" },
      fetchImpl: async () => new Response("", { status: 429 }),
    });
    const result = await rateLimited.execute(request);
    expect(result.error).toMatchObject({ code: "RATE_LIMIT", retryable: true });
    expect(JSON.stringify(result)).not.toContain("secret");
    const timedOut = createOpenAIProviderGateway({
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "secret" },
      fetchImpl: async (_url, init) =>
        await new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    });
    const timeout = await timedOut.execute({ ...request, timeoutSeconds: 0.001 });
    expect(timeout.error?.code).toBe("TIMEOUT");
  });
});
