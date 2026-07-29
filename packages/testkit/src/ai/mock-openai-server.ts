import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {
  jacomoAgentResponse,
  isJacomoAgentName,
  type JacomoAgentName,
} from "./jacomo-responses.js";

export type MockOpenAIScenario =
  | "jacomo-happy-path"
  | "schema-invalid-repairable"
  | "schema-invalid-permanent"
  | "timeout"
  | "rate-limit"
  | "unknown-error";

export interface MockOpenAIRequest {
  readonly agent: JacomoAgentName;
  readonly repair: boolean;
  readonly requestId: string;
}
export interface MockOpenAIServer {
  readonly baseUrl: string;
  readonly port: number;
  readonly scenario: MockOpenAIScenario;
  readonly requests: readonly MockOpenAIRequest[];
  close(): Promise<void>;
}
export interface MockOpenAIClientOptions {
  readonly timeoutMs?: number;
  readonly repair?: boolean;
}

export class MockOpenAIError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errorCode: string,
  ) {
    super(message);
    this.name = "MockOpenAIError";
  }
}

function bodyOf(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function parseAgent(body: Record<string, unknown>): JacomoAgentName {
  const metadata = body.metadata;
  const messages = body.messages;
  const candidate =
    typeof metadata === "object" && metadata !== null && "agent" in metadata
      ? metadata.agent
      : Array.isArray(messages) &&
          typeof messages[0] === "object" &&
          messages[0] !== null &&
          "content" in messages[0]
        ? String(messages[0].content).match(/agent=([^\s]+)/)?.[1]
        : undefined;
  if (!isJacomoAgentName(candidate))
    throw new MockOpenAIError(400, "agent is required", "INVALID_AGENT");
  return candidate;
}

function responseFor(agent: JacomoAgentName, requestId: string, payload: Record<string, unknown>) {
  return {
    id: requestId,
    object: "chat.completion",
    created: 1768478400,
    model: "mock-gpt-jacomo-1",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(payload) },
      },
    ],
    usage: { prompt_tokens: 32, completion_tokens: 64, total_tokens: 96 },
    metadata: { agent },
  };
}

async function listen(server: Server): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("mock server address unavailable"));
      resolve({ port: address.port });
    });
  });
}

export async function startMockOpenAIServer(
  scenario: MockOpenAIScenario = "jacomo-happy-path",
): Promise<MockOpenAIServer> {
  const requests: MockOpenAIRequest[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "mock route not found" } });
      return;
    }
    const parsed = JSON.parse(await bodyOf(request)) as Record<string, unknown>;
    const agent = parseAgent(parsed);
    const metadata = parsed.metadata;
    const repair =
      parsed.repair === true ||
      (typeof metadata === "object" &&
        metadata !== null &&
        "repair" in metadata &&
        metadata.repair === true);
    const requestId = `mock-jacomo-${String(requests.length + 1).padStart(3, "0")}`;
    requests.push({ agent, repair, requestId });
    if (scenario === "timeout") {
      await delay(250);
      if (!response.writableEnded)
        sendJson(response, 504, {
          error: { code: "MOCK_TIMEOUT", message: "mock response timeout" },
        });
      return;
    }
    if (scenario === "rate-limit") {
      sendJson(response, 429, {
        error: { code: "RATE_LIMITED", message: "mock rate limit", retry_after_ms: 25 },
      });
      return;
    }
    if (scenario === "unknown-error") {
      sendJson(response, 500, { error: { code: "MOCK_UNKNOWN", message: "mock unknown failure" } });
      return;
    }
    if (
      scenario === "schema-invalid-permanent" ||
      (scenario === "schema-invalid-repairable" && !repair)
    ) {
      sendJson(
        response,
        200,
        responseFor(agent, requestId, { invalid: true, agent, repairAttempt: repair }),
      );
      return;
    }
    sendJson(response, 200, responseFor(agent, requestId, jacomoAgentResponse(agent)));
  });
  const { port } = await listen(server);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    scenario,
    requests,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function fetchCompletion(
  server: MockOpenAIServer,
  agent: JacomoAgentName,
  repair: boolean,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock-gpt-jacomo-1",
        messages: [{ role: "user", content: `agent=${agent}` }],
        metadata: { agent, repair },
        repair,
      }),
      signal: controller.signal,
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = body.error as Record<string, unknown> | undefined;
      throw new MockOpenAIError(
        response.status,
        String(error?.message ?? "mock request failed"),
        String(error?.code ?? "MOCK_ERROR"),
      );
    }
    const choice = (body.choices as Array<Record<string, unknown>> | undefined)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    return JSON.parse(String(message?.content ?? "{}")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new MockOpenAIError(408, "mock request timed out", "TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isValidPayload(payload: Record<string, unknown>): boolean {
  return !payload.invalid && typeof payload === "object" && Object.keys(payload).length > 0;
}

export async function requestMockOpenAI(
  server: MockOpenAIServer,
  agent: JacomoAgentName,
  options: MockOpenAIClientOptions = {},
): Promise<Record<string, unknown>> {
  const first = await fetchCompletion(
    server,
    agent,
    options.repair ?? false,
    options.timeoutMs ?? 1_000,
  );
  if (isValidPayload(first)) return first;
  const repaired = await fetchCompletion(server, agent, true, options.timeoutMs ?? 1_000);
  if (!isValidPayload(repaired))
    throw new MockOpenAIError(422, "schema remained invalid after one repair", "SCHEMA_INVALID");
  return repaired;
}
