export interface WorkerHealth {
  readonly status: "starting" | "ready" | "stopping" | "stopped";
  readonly activeHandlers: number;
  readonly checkedAt: string;
}

export function createWorkerHealth(): WorkerHealth {
  return Object.freeze({
    status: "starting",
    activeHandlers: 0,
    checkedAt: new Date().toISOString(),
  });
}
