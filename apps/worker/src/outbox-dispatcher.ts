import type { BullMqAdapter } from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { OutboxRepository } from "../../../packages/core/src/modules/operations/outbox-repository.js";
import { publishOutbox } from "./handlers/outbox/publish-outbox.js";

export interface OutboxDispatcherOptions {
  readonly pollIntervalMs?: number;
  readonly batchLimit?: number;
  readonly leaseMs?: number;
}

export function createOutboxDispatcher(
  repository: OutboxRepository,
  queue: BullMqAdapter,
  options: OutboxDispatcherOptions = {},
) {
  const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 500);
  const batchLimit = Math.max(1, options.batchLimit ?? 50);
  const leaseMs = Math.max(1_000, options.leaseMs ?? 30_000);
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await publishOutbox(repository, queue, { limit: batchLimit, leaseMs });
    } finally {
      running = false;
    }
  };

  return {
    async start(): Promise<void> {
      stopped = false;
      await tick();
      timer = setInterval(() => void tick(), pollIntervalMs);
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      while (running) await new Promise<void>((resolve) => setTimeout(resolve, 10));
    },
    async flush(): Promise<void> {
      await tick();
    },
  };
}
