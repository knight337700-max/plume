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

export interface WorkerReadinessCheck {
  readonly name: string;
  readonly check: () => Promise<void> | void;
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
    readonly readinessChecks?: readonly WorkerReadinessCheck[];
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
    failedChecks: [],
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
          failedChecks: ["runtime-handlers"],
          checkedAt: new Date().toISOString(),
        });
        return state;
      }
      const failedChecks: string[] = [];
      for (const readinessCheck of options.readinessChecks ?? []) {
        try {
          await readinessCheck.check();
        } catch {
          failedChecks.push(readinessCheck.name);
        }
      }
      if (failedChecks.length > 0) {
        state = Object.freeze({
          status: "not-ready" as const,
          activeHandlers: 0,
          missingHandlerTypes,
          failedChecks: Object.freeze(failedChecks),
          checkedAt: new Date().toISOString(),
        });
        return state;
      }
      try {
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
      } catch {
        await adapter.close();
        state = Object.freeze({
          status: "not-ready" as const,
          activeHandlers: 0,
          missingHandlerTypes,
          failedChecks: ["queue-consumer"],
          checkedAt: new Date().toISOString(),
        });
        return state;
      }
      state = Object.freeze({
        status: "ready" as const,
        activeHandlers: workers.length,
        missingHandlerTypes,
        failedChecks: [],
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
        failedChecks: state.failedChecks,
        checkedAt: new Date().toISOString(),
      });
      return state;
    },
    health() {
      return state;
    },
  };
}
