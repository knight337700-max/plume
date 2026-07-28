import { createSchedulerLease } from "./lease.js";
import { scheduledJobs, type ScheduledJobDefinition } from "./jobs/index.js";

export interface SchedulerBootstrap {
  start(): boolean;
  stop(): void;
  isRunning(): boolean;
}

export function createSchedulerBootstrap(
  jobs: readonly ScheduledJobDefinition[] = scheduledJobs,
  lease = createSchedulerLease("plume:scheduler"),
): SchedulerBootstrap {
  const timers: ReturnType<typeof setInterval>[] = [];
  let running = false;

  return {
    start() {
      if (running || !lease.acquire()) return running;
      running = true;
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
    stop() {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      lease.release();
      running = false;
    },
    isRunning() {
      return running && lease.isOwner();
    },
  };
}

if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.js")) {
  createSchedulerBootstrap().start();
}
