import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOpenAIProviderGateway } from "./openai-gateway.js";

function requestFor(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg",
  detail: "high" | "low",
) {
  return {
    taskId: "image-task",
    modelPolicyId: "vision-quality-v1",
    messages: [{ role: "user" as const, content: "Analyze the selected product." }],
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    imageInputs: [
      {
        fileId: `${mimeType}-file`,
        mimeType,
        bytes,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        detail,
      },
    ],
    timeoutSeconds: 2,
    metadata: {
      workspaceId: "workspace-1",
      agentCode: "LAYOUT_PLANNER",
      promptVersion: "1.0.0",
      correlationId: "corr-image",
    },
  };
}

describe("OpenAI image input request", () => {
  it.each([
    ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "high"],
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "low"],
  ] as const)("encodes %s as a data URL", async (mimeType, bytes, detail) => {
    let received: Record<string, unknown> | undefined;
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "test-secret" },
      fetchImpl: async (_url, init) => {
        received = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "image-response", output_text: '{"ok":true}' }), {
          status: 200,
        });
      },
    });
    const result = await gateway.execute(requestFor(bytes, mimeType, detail));
    expect(result.status).toBe("COMPLETED");
    const input = received?.input as readonly {
      role: string;
      content: readonly Record<string, unknown>[];
    }[];
    expect(input).toHaveLength(1);
    expect(input[0]?.role).toBe("user");
    expect(input[0]?.content[0]).toEqual({
      type: "input_text",
      text: "user: Analyze the selected product.",
    });
    expect(input[0]?.content[1]).toMatchObject({ type: "input_image", detail });
    expect(input[0]?.content[1]?.image_url).toBe(
      `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
    );
    expect((received?.text as { format: { type: string; strict: boolean } }).format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(JSON.stringify(result)).not.toContain("data:");
  });

  it("blocks invalid checksums without making a fetch request", async () => {
    let fetchCalls = 0;
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "test-secret" },
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 });
      },
    });
    const request = requestFor(new Uint8Array([1, 2, 3]), "image/png", "high");
    const result = await gateway.execute({
      ...request,
      imageInputs: [{ ...request.imageInputs[0]!, checksumSha256: "0".repeat(64) }],
    });
    expect(fetchCalls).toBe(0);
    expect(result.status).toBe("FAILED");
    expect(result.error?.message).toContain("AGENT_IMAGE_INPUT_CHECKSUM_MISMATCH");
  });

  it("retains the text-only string input shape", async () => {
    let received: Record<string, unknown> | undefined;
    const gateway = createOpenAIProviderGateway({
      endpoint: "https://mock.openai.test/v1/responses",
      environment: { OPENAI_MODEL: "gpt-5.6-luna", OPENAI_API_KEY: "test-secret" },
      fetchImpl: async (_url, init) => {
        received = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 });
      },
    });
    const request = requestFor(new Uint8Array([1]), "image/png", "auto");
    await gateway.execute({ ...request, imageInputs: [] });
    expect(typeof received?.input).toBe("string");
    expect(received?.input).toBe("user: Analyze the selected product.");
  });
});
