import { afterEach, describe, expect, it } from "vitest";
import { JACOMO_AGENT_NAMES } from "./jacomo-responses.js";
import {
  requestMockOpenAI,
  startMockOpenAIServer,
  type MockOpenAIServer,
} from "./mock-openai-server.js";

const servers: MockOpenAIServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serverFor(scenario: Parameters<typeof startMockOpenAIServer>[0]) {
  const server = await startMockOpenAIServer(scenario);
  servers.push(server);
  return server;
}

describe("deterministic Jacomo OpenAI mock", () => {
  it("serves the eight happy-path agent responses", async () => {
    const server = await serverFor("jacomo-happy-path");
    for (const agent of JACOMO_AGENT_NAMES)
      expect(Object.keys(await requestMockOpenAI(server, agent)).length).toBeGreaterThan(0);
    expect(server.requests).toHaveLength(8);
  });

  it("performs exactly one repair for repairable invalid schema", async () => {
    const server = await serverFor("schema-invalid-repairable");
    expect(await requestMockOpenAI(server, "Layout Planner")).toMatchObject({
      width: 1029,
      height: 258,
    });
    expect(server.requests.map(({ repair }) => repair)).toEqual([false, true]);
  });

  it("fails permanent schema invalid after one repair", async () => {
    const server = await serverFor("schema-invalid-permanent");
    await expect(requestMockOpenAI(server, "Copy Generator")).rejects.toMatchObject({
      errorCode: "SCHEMA_INVALID",
    });
    expect(server.requests.map(({ repair }) => repair)).toEqual([false, true]);
  });

  it.each([
    ["timeout", "TIMEOUT", 408],
    ["rate-limit", "RATE_LIMITED", 429],
    ["unknown-error", "MOCK_UNKNOWN", 500],
  ] as const)(
    "returns deterministic %s error without an external key",
    async (scenario, errorCode, status) => {
      const server = await serverFor(scenario);
      await expect(
        requestMockOpenAI(server, "Campaign Analyst", { timeoutMs: 25 }),
      ).rejects.toMatchObject({ errorCode, status });
      expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(server.requests).toHaveLength(1);
    },
  );

  it("closes its dynamic port and releases the handle", async () => {
    const server = await serverFor("jacomo-happy-path");
    await server.close();
    servers.splice(servers.indexOf(server), 1);
    await expect(requestMockOpenAI(server, "Export Assistant")).rejects.toBeInstanceOf(Error);
  });
});
