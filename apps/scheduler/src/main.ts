import { createSchedulerLease } from "./lease.js";
import { scheduledJobs, type ScheduledJobDefinition } from "./jobs/index.js";

export interface SchedulerBootstrap {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createSchedulerBootstrap(
  jobs: readonly ScheduledJobDefinition[] = scheduledJobs,
  lease = createSchedulerLease(),
): SchedulerBootstrap {
  const timers: ReturnType<typeof setInterval>[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let running = false;

  return {
    async start() {
      if (running || !(await lease.acquire())) return running;
      running = true;
      heartbeat = setInterval(() => {
        void lease.renew().then((owned) => {
          if (!owned) {
            running = false;
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
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = undefined;
      await lease.release();
      await lease.close();
      running = false;
    },
    isRunning() {
      return running && lease.isOwner();
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
