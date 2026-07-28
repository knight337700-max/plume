import type { AsyncJobItemStatus } from "./async-job-item.js";
import type { AsyncJobStatus } from "./async-job.js";

export interface JobRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: AsyncJobStatus;
  readonly progressPercent: number;
  readonly attemptNo: number;
  readonly maxAttempts: number;
}

export interface JobItemRecord {
  readonly id: string;
  readonly jobId: string;
  readonly itemKey: string;
  readonly status: AsyncJobItemStatus;
  readonly progressPercent: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

export interface JobRepository {
  getJob(id: string): Promise<JobRecord | null>;
  listItems(jobId: string): Promise<readonly JobItemRecord[]>;
  updateItem(item: JobItemRecord): Promise<void>;
  updateProgress(jobId: string, progressPercent: number, status: AsyncJobStatus): Promise<void>;
}

export function aggregateProgress(items: readonly JobItemRecord[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce(
    (sum, item) => sum + Math.max(0, Math.min(100, item.progressPercent)),
    0,
  );
  return Number((total / items.length).toFixed(2));
}
