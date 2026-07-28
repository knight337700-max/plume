import { describe, expect, it } from "vitest";
import { createOpenAIProviderGateway } from "./openai-gateway.js";

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
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_DEFAULT_MODEL: "mock-model", OPENAI_API_KEY: "test-secret" },
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
    const result = await gateway.execute(request);
    expect(receivedBody?.model).toBe("mock-model");
    expect(
      (receivedBody?.text as { format: { type: string; strict: boolean } }).format,
    ).toMatchObject({ type: "json_schema", strict: true });
    expect(result).toMatchObject({
      provider: "OpenAI",
      model: "mock-model",
      status: "COMPLETED",
      providerRequestId: "req-1",
      outputJson: { items: [{ id: "p1" }] },
    });
  });

  it("maps rate limits and timeout without exposing credentials", async () => {
    const rateLimited = createOpenAIProviderGateway({
      environment: { OPENAI_DEFAULT_MODEL: "mock-model", OPENAI_API_KEY: "secret" },
      fetchImpl: async () => new Response("", { status: 429 }),
    });
    const result = await rateLimited.execute(request);
    expect(result.error).toMatchObject({ code: "RATE_LIMIT", retryable: true });
    expect(JSON.stringify(result)).not.toContain("secret");
    const timedOut = createOpenAIProviderGateway({
      environment: { OPENAI_DEFAULT_MODEL: "mock-model", OPENAI_API_KEY: "secret" },
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
