import { describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { outboxToCommandEnvelope, publishOutbox } from "./publish-outbox.js";
import type {
  OutboxMessage,
  OutboxRepository,
} from "../../../../../packages/core/src/modules/operations/outbox-repository.js";
import type { BullMqAdapter } from "../../../../../packages/infrastructure/src/queue/bullmq.js";
import { LIVE_SMOKE_SYNTHETIC_SCENARIO_ID } from "../../../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const id = "00000000-0000-4000-8000-000000000001";
const message: OutboxMessage = {
  id,
  workspaceId: id,
  topic: "ai-standard",
  messageKey: id,
  messageType: "creative.generate",
  schemaVersion: 1,
  payloadJson: {
    campaignId: id,
    productIds: [id],
    formatProfileIds: [id],
    variantCountPerProduct: 1,
  },
  headersJson: {
    messageId: id,
    correlationId: id,
    jobId: id,
    jobItemId: id,
    createdAt: new Date().toISOString(),
    attemptCount: 99,
    leaseExpiresAt: "secret-internal-value",
  },
  availableAt: new Date(),
  attemptCount: 1,
  createdAt: new Date(),
};

describe("outbox command publishing", () => {
  it("maps an outbox row to a canonical envelope without DB metadata", () => {
    const envelope = outboxToCommandEnvelope(message);
    expect(envelope).toMatchObject({
      messageId: id,
      command: "creative.generate",
      payload: message.payloadJson,
    });
    expect(envelope).not.toHaveProperty("attemptCount");
    expect(envelope).not.toHaveProperty("leaseExpiresAt");
  });

  it("publishes the canonical envelope with messageId as BullMQ jobId", async () => {
    const calls: unknown[] = [];
    const queue = {
      enqueue: async (...args: unknown[]) => {
        calls.push(args);
        return {} as Job<unknown>;
      },
    } as unknown as BullMqAdapter;
    const repository: OutboxRepository = {
      async claim() {
        return [message];
      },
      async insert() {
        return message;
      },
      async markPublished() {
        calls.push("published");
      },
      async markFailed() {
        calls.push("failed");
      },
    };
    await publishOutbox(repository, queue);
    expect(calls[0]).toMatchObject([
      "ai-standard",
      { name: "creative.generate", data: { messageId: id }, options: { jobId: id } },
    ]);
    expect(calls).toContain("published");
  });

  it("disables queue delivery retries for diagnostic live smoke payloads", async () => {
    const calls: unknown[] = [];
    const queue = {
      enqueue: async (...args: unknown[]) => {
        calls.push(args);
        return {} as Job<unknown>;
      },
    } as unknown as BullMqAdapter;
    const diagnostic: OutboxMessage = {
      ...message,
      topic: "ai-standard",
      messageType: "ai.live_smoke.verify",
      payloadJson: {
        verificationRunId: id,
        parentWorkflowJobId: id,
        agentCode: "LAYOUT_PLANNER",
        workspaceId: id,
        smokeRunId: id,
        budgetEpochId: id,
        workflowCallBudget: 3,
        syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
        verificationOnly: true,
        retryEnabled: false,
        repairEnabled: false,
      },
    };
    const repository: OutboxRepository = {
      async claim() {
        return [diagnostic];
      },
      async insert() {
        return diagnostic;
      },
      async markPublished() {},
      async markFailed() {},
    };
    await publishOutbox(repository, queue);
    expect(calls[0]).toMatchObject(["ai-standard", { options: { attempts: 1 } }]);
  });
});
