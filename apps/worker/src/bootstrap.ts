import type { Worker } from "bullmq";
import {
  createBullMqAdapter,
  type BullMqAdapter,
  type QueueHandler,
} from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { WorkerHealth } from "./health.js";

export interface WorkerHandlerRegistration {
  readonly queue: string;
  readonly handler: QueueHandler;
  readonly concurrency?: number;
}

export interface WorkerBootstrap {
  start(): Promise<WorkerHealth>;
  stop(): Promise<WorkerHealth>;
  health(): WorkerHealth;
}

export function createWorkerBootstrap(
  options: {
    readonly adapter?: BullMqAdapter;
    readonly handlers?: readonly WorkerHandlerRegistration[];
  } = {},
): WorkerBootstrap {
  const adapter = options.adapter ?? createBullMqAdapter();
  const handlers = options.handlers ?? [];
  let state: WorkerHealth = Object.freeze({
    status: "starting",
    activeHandlers: 0,
    checkedAt: new Date().toISOString(),
  });
  const workers: Worker[] = [];

  return {
    async start() {
      if (state.status === "ready") return state;
      for (const registration of handlers) {
        workers.push(
          adapter.consume(registration.queue, registration.handler, {
            concurrency: registration.concurrency,
          }),
        );
      }
      state = Object.freeze({
        status: "ready",
        activeHandlers: workers.length,
        checkedAt: new Date().toISOString(),
      });
      return state;
    },
    async stop() {
      if (state.status === "stopped") return state;
      state = Object.freeze({ ...state, status: "stopping", checkedAt: new Date().toISOString() });
      await adapter.close();
      workers.length = 0;
      state = Object.freeze({
        status: "stopped",
        activeHandlers: 0,
        checkedAt: new Date().toISOString(),
      });
      return state;
    },
    health() {
      return state;
    },
  };
}
