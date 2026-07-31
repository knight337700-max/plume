import {
  createBullMqAdapter,
  type BullMqAdapter,
  type QueueHandler,
} from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { WorkerHealth } from "./health.js";

type WorkerHandle = { close(): Promise<void> };

export interface WorkerHandlerRegistration {
  readonly queue: string;
  readonly handler: QueueHandler<unknown>;
  readonly messageTypes?: readonly string[];
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
    readonly requiredHandlerTypes?: readonly string[];
  } = {},
): WorkerBootstrap {
  const adapter = options.adapter ?? createBullMqAdapter();
  const handlers = options.handlers ?? [];
  const registeredHandlerTypes = new Set(handlers.flatMap((registration) => registration.messageTypes ?? []));
  const missingHandlerTypes = Object.freeze(
    [...new Set(options.requiredHandlerTypes ?? [])].filter((type) => !registeredHandlerTypes.has(type)),
  );
  let state: WorkerHealth = Object.freeze({
    status: "starting",
    activeHandlers: 0,
    missingHandlerTypes,
    checkedAt: new Date().toISOString(),
  });
  const workers: WorkerHandle[] = [];

  return {
    async start() {
      if (state.status === "ready") return state;
      if (handlers.length === 0 || missingHandlerTypes.length > 0) {
        state = Object.freeze({
          status: "not-ready" as const,
          activeHandlers: 0,
          missingHandlerTypes,
          checkedAt: new Date().toISOString(),
        });
        return state;
      }
      for (const registration of handlers) {
        workers.push(
          adapter.consume(
            registration.queue,
            registration.handler,
            registration.concurrency === undefined
              ? {}
              : { concurrency: registration.concurrency },
          ),
        );
      }
      state = Object.freeze({
        status: "ready" as const,
        activeHandlers: workers.length,
        missingHandlerTypes,
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
        status: "stopped" as const,
        activeHandlers: 0,
        missingHandlerTypes,
        checkedAt: new Date().toISOString(),
      });
      return state;
    },
    health() {
      return state;
    },
  };
}
