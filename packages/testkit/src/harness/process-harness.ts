import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import postgres, { type Sql } from "postgres";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../../apps/api/src/app.js";
import {
  startMockOpenAIServer,
  type MockOpenAIServer,
  type MockOpenAIScenario,
} from "../ai/mock-openai-server.js";

export interface HarnessService {
  readonly name: string;
  readonly url: string;
  readonly port: number;
  readonly status: "ready";
}
export interface ProcessHarnessOptions {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly minioUrl?: string;
  readonly mockScenario?: MockOpenAIScenario;
}
export interface ProcessHarness {
  readonly services: Readonly<Record<string, HarnessService>>;
  readonly mockOpenAI: MockOpenAIServer;
  readonly logs: readonly string[];
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

const defaultDatabaseUrl = "postgresql://plume:plume_local_only@localhost:5432/plume_test";
const defaultRedisUrl = "redis://localhost:6379";
const defaultMinioUrl = "http://localhost:9000";

function redact(value: string): string {
  return value.replace(/(password|secret|api[_-]?key|token)=?[^\s&]+/gi, "$1=[REDACTED]");
}
function tcpReady(host: string, port: number, timeoutMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP readiness timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
async function waitFor(check: () => Promise<void>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(
    `readiness deadline exceeded: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
async function healthServer(name: string): Promise<{ service: HarnessService; server: Server }> {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ready", name }));
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error(`${name} address unavailable`));
      resolve(address.port);
    });
  });
  return { server, service: { name, url: `http://127.0.0.1:${port}`, port, status: "ready" } };
}
async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export async function startProcessHarness(
  options: ProcessHarnessOptions = {},
): Promise<ProcessHarness> {
  const databaseUrl = options.databaseUrl ?? process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl;
  const redisUrl = new URL(options.redisUrl ?? process.env.REDIS_URL ?? defaultRedisUrl);
  const minioUrl = options.minioUrl ?? process.env.S3_ENDPOINT ?? defaultMinioUrl;
  const logs: string[] = [];
  let database: Sql | null = null;
  let api: FastifyInstance | null = null;
  const managedServers: Server[] = [];
  const mockOpenAI = await startMockOpenAIServer(options.mockScenario ?? "jacomo-happy-path");
  try {
    database = postgres(databaseUrl, { max: 1 });
    await waitFor(async () => {
      await database!`SELECT 1`;
    });
    await waitFor(() => tcpReady(redisUrl.hostname, Number(redisUrl.port || 6379)));
    await waitFor(async () => {
      const response = await fetch(`${minioUrl}/minio/health/live`);
      if (!response.ok) throw new Error(`MinIO ${response.status}`);
    });
    const worker = await healthServer("worker");
    const scheduler = await healthServer("scheduler");
    managedServers.push(worker.server, scheduler.server);
    api = await buildApp();
    const apiUrl = await api.listen({ host: "127.0.0.1", port: 0 });
    const parsedApiUrl = new URL(apiUrl);
    await waitFor(async () => {
      const response = await fetch(`${apiUrl}/api/v1/health`);
      if (!response.ok) throw new Error(`API ${response.status}`);
    });
    logs.push(
      redact(`api=${apiUrl} worker=${worker.service.url} scheduler=${scheduler.service.url}`),
    );
    const services = {
      postgres: {
        name: "postgres",
        url: databaseUrl,
        port: Number(new URL(databaseUrl).port || 5432),
        status: "ready" as const,
      },
      redis: {
        name: "redis",
        url: redisUrl.toString(),
        port: Number(redisUrl.port || 6379),
        status: "ready" as const,
      },
      minio: {
        name: "minio",
        url: minioUrl,
        port: Number(new URL(minioUrl).port || 9000),
        status: "ready" as const,
      },
      mockOpenAI: {
        name: "mock-openai",
        url: mockOpenAI.baseUrl,
        port: mockOpenAI.port,
        status: "ready" as const,
      },
      api: { name: "api", url: apiUrl, port: Number(parsedApiUrl.port), status: "ready" as const },
      worker: worker.service,
      scheduler: scheduler.service,
    };
    return {
      services,
      mockOpenAI,
      logs,
      request: (path, init) => fetch(`${apiUrl}${path}`, init),
      close: async () => {
        await api?.close();
        api = null;
        for (const server of managedServers) await closeServer(server);
        await mockOpenAI.close();
        await database?.end({ timeout: 5 });
        database = null;
      },
    };
  } catch (error) {
    await api?.close();
    for (const server of managedServers) await closeServer(server);
    await mockOpenAI.close();
    await database?.end({ timeout: 5 });
    throw error;
  }
}
