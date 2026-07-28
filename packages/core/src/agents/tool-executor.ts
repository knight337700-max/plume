import { createHash } from "node:crypto";
import type { AgentCode } from "./prompt-registry.js";
import { toolRegistry, type AgentToolDefinition } from "./tool-registry.js";

export interface ToolExecutionRequest {
  readonly requestId: string;
  readonly agentCode: AgentCode;
  readonly toolCode: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ToolExecutionContext {
  readonly requestId: string;
  readonly agentCode: AgentCode;
  readonly tool: AgentToolDefinition;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export type ToolHandler = (context: ToolExecutionContext) => Promise<unknown> | unknown;

export interface ToolExecutionResult {
  readonly toolCode: string;
  readonly workspaceId: string;
  readonly result: unknown;
  readonly resultHash: string;
}

export interface ToolExecutor {
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}

function assertSafeRequest(request: ToolExecutionRequest): void {
  if (!request.requestId.trim() || !request.subjectId.trim() || !request.workspaceId.trim()) {
    throw new Error("requestId, workspaceId, and subjectId are required");
  }
  if (Object.prototype.hasOwnProperty.call(request.input, "workspaceId")) {
    throw new Error("workspaceId is injected by server context");
  }
}

export function createToolExecutor(options: {
  readonly handlers: Readonly<Record<string, ToolHandler>>;
  readonly maxCalls?: number;
}): ToolExecutor {
  let calls = 0;
  const maxCalls = options.maxCalls ?? 8;
  return {
    async execute(request) {
      assertSafeRequest(request);
      if (calls >= maxCalls) throw new Error("Agent tool call limit exceeded");
      const tool = toolRegistry.resolve(request.toolCode);
      if (!tool.allowedAgents.includes(request.agentCode)) {
        throw new Error(`Unauthorized tool ${request.toolCode} for ${request.agentCode}`);
      }
      const handler = options.handlers[request.toolCode];
      if (!handler) throw new Error(`No server handler registered for ${request.toolCode}`);
      calls += 1;
      const result = await handler({
        requestId: request.requestId,
        agentCode: request.agentCode,
        tool,
        workspaceId: request.workspaceId,
        subjectId: request.subjectId,
        input: request.input,
      });
      const serialized = JSON.stringify(result);
      if (Buffer.byteLength(serialized, "utf8") > tool.maxResponseBytes) {
        throw new Error(`Tool response exceeds limit: ${request.toolCode}`);
      }
      return Object.freeze({
        toolCode: request.toolCode,
        workspaceId: request.workspaceId,
        result,
        resultHash: createHash("sha256").update(serialized).digest("hex"),
      });
    },
  };
}
