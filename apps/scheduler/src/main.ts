import { createSchedulerLease } from "./lease.js";
import { scheduledJobs, type ScheduledJobDefinition } from "./jobs/index.js";

export interface SchedulerBootstrap {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  isRunning(): boolean;
  health(): SchedulerHealth;
}

export interface SchedulerHealth {
  readonly status: "starting" | "ready" | "not-ready" | "stopping" | "stopped";
  readonly failedChecks: readonly string[];
  readonly checkedAt: string;
}

export interface SchedulerReadinessCheck {
  readonly name: string;
  readonly check: () => Promise<void> | void;
}

export function createSchedulerBootstrap(
  jobs: readonly ScheduledJobDefinition[] = scheduledJobs,
  lease = createSchedulerLease(),
  readinessChecks: readonly SchedulerReadinessCheck[] = [],
): SchedulerBootstrap {
  const timers: ReturnType<typeof setInterval>[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let health: SchedulerHealth = Object.freeze({
    status: "starting" as const,
    failedChecks: [],
    checkedAt: new Date().toISOString(),
  });

  return {
    async start() {
      if (running) return true;
      const failedChecks: string[] = [];
      for (const readinessCheck of readinessChecks) {
        try {
          await readinessCheck.check();
        } catch {
          failedChecks.push(readinessCheck.name);
        }
      }
      if (failedChecks.length > 0) {
        health = Object.freeze({
          status: "not-ready" as const,
          failedChecks: Object.freeze(failedChecks),
          checkedAt: new Date().toISOString(),
        });
        return false;
      }
      if (!(await lease.acquire())) {
        health = Object.freeze({
          status: "not-ready" as const,
          failedChecks: ["lease"],
          checkedAt: new Date().toISOString(),
        });
        return false;
      }
      running = true;
      health = Object.freeze({
        status: "ready" as const,
        failedChecks: [],
        checkedAt: new Date().toISOString(),
      });
      heartbeat = setInterval(() => {
        void lease.renew().then((owned) => {
          if (!owned) {
            running = false;
            health = Object.freeze({
              status: "not-ready" as const,
              failedChecks: ["lease"],
              checkedAt: new Date().toISOString(),
            });
            for (const timer of timers) clearInterval(timer);
            timers.length = 0;
          }
        });
      }, Math.max(1_000, Math.floor(lease.ttlMs / 3)));
      for (const job of jobs) {
        timers.push(
          setInterval(() => {
            if (!lease.isOwner()) {
              running = false;
              return;
            }
            void job.run();
          }, job.intervalMs),
        );
      }
      return true;
    },
    async stop() {
      health = Object.freeze({
        status: "stopping" as const,
        failedChecks: health.failedChecks,
        checkedAt: new Date().toISOString(),
      });
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
      await lease.release();
      await lease.close();
      running = false;
      health = Object.freeze({
        status: "stopped" as const,
        failedChecks: health.failedChecks,
        checkedAt: new Date().toISOString(),
      });
    },
    isRunning() {
      return running && lease.isOwner();
    },
    health() {
      return health;
    },
  };
}

if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.js")) {
  const bootstrap = createSchedulerBootstrap();
  const started = await bootstrap.start();
  if (!started) {
    console.error("Scheduler lease was not acquired");
    process.exitCode = 1;
  }
}
