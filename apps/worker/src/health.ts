export interface WorkerHealth {
  readonly status: "starting" | "ready" | "not-ready" | "stopping" | "stopped";
  readonly activeHandlers: number;
  readonly missingHandlerTypes: readonly string[];
  readonly checkedAt: string;
}

export function createWorkerHealth(): WorkerHealth {
  return Object.freeze({
    status: "starting",
    activeHandlers: 0,
    missingHandlerTypes: [],
    checkedAt: new Date().toISOString(),
  });
}
