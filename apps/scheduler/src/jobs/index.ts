export type ScheduledJob = () => Promise<void> | void;

export interface ScheduledJobDefinition {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: ScheduledJob;
}

export const scheduledJobs: readonly ScheduledJobDefinition[] = Object.freeze([]);

export function defineScheduledJob(definition: ScheduledJobDefinition): ScheduledJobDefinition {
  if (!definition.name || definition.intervalMs < 1000)
    throw new Error("Invalid scheduled job definition");
  return Object.freeze({ ...definition });
}
