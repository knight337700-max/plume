import { describe, expect, it } from "vitest";
import type { MessageEnvelope } from "../../../../packages/core/src/async/message-envelope.js";
import type { InboxRepository } from "../../../../packages/core/src/modules/operations/inbox-repository.js";
import { createIdempotencyGuard, summarizeOutcome } from "./idempotency.js";

function envelope(messageId: string): MessageEnvelope<{ value: string }> {
  return {
    messageId,
    schemaVersion: 1,
    workspaceId: "workspace-1",
    correlationId: "correlation-1",
    jobId: "job-1",
    createdAt: new Date().toISOString(),
    payload: { value: "payload" },
  };
}

function memoryInbox(): InboxRepository {
  const records = new Map<string, unknown>();
  const key = (input: { workspaceId: string; messageId: string; handlerName: string; handlerVersion: string }) =>
    [input.workspaceId, input.messageId, input.handlerName, input.handlerVersion].join("|");
  return {
    async tryStart(input) {
      const recordKey = key(input);
      if (records.has(recordKey)) return { acquired: false, priorOutcome: records.get(recordKey) };
      records.set(recordKey, undefined);
      return { acquired: true };
    },
    async complete(input) { records.set(key(input), input.outcome); },
    async release(input) { records.delete(key(input)); },
  };
}

describe("queue consumer idempotency", () => {
  it("performs one side effect for duplicate delivery and stores only a safe summary", async () => {
    const repository = memoryInbox();
    const guard = createIdempotencyGuard(repository, { handlerName: "job-handler", handlerVersion: "1", queuePrefix: "plume-staging" });
    let calls = 0;
    const handler = async () => {
      calls += 1;
      return { status: "COMPLETED", id: "result-1", prompt: "must not be stored", output: { secret: "no" } };
    };
    await guard(envelope("message-1"), handler);
    await guard(envelope("message-1"), handler);
    expect(calls).toBe(1);
    expect(summarizeOutcome({ status: "COMPLETED", id: "result-1", prompt: "secret" })).toEqual({ status: "COMPLETED", id: "result-1" });
  });

  it("releases a failed claim so a retry can run", async () => {
    const repository = memoryInbox();
    const guard = createIdempotencyGuard(repository, { handlerName: "job-handler", handlerVersion: "1", queuePrefix: "plume-staging" });
    let calls = 0;
    await expect(guard(envelope("message-2"), async () => {
      calls += 1;
      throw new Error("retryable");
    })).rejects.toThrow("retryable");
    await expect(guard(envelope("message-2"), async () => {
      calls += 1;
      return { status: "COMPLETED" };
    })).resolves.toEqual({ status: "COMPLETED" });
    expect(calls).toBe(2);
  });

  it("allows only one concurrent duplicate to enter the side effect", async () => {
    const repository = memoryInbox();
    const guard = createIdempotencyGuard(repository, { handlerName: "job-handler", handlerVersion: "1", queuePrefix: "plume-staging" });
    let calls = 0;
    const handler = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { status: "COMPLETED", id: "result-concurrent" };
    };
    await Promise.all([guard(envelope("message-concurrent"), handler), guard(envelope("message-concurrent"), handler)]);
    expect(calls).toBe(1);
  });

  it("scopes the ledger by queue prefix", async () => {
    const repository = memoryInbox();
    let calls = 0;
    const handler = async () => { calls += 1; return { status: "COMPLETED" }; };
    await createIdempotencyGuard(repository, { handlerName: "job-handler", handlerVersion: "1", queuePrefix: "plume-staging" })(envelope("message-3"), handler);
    await createIdempotencyGuard(repository, { handlerName: "job-handler", handlerVersion: "1", queuePrefix: "plume-production" })(envelope("message-3"), handler);
    expect(calls).toBe(2);
  });
});
