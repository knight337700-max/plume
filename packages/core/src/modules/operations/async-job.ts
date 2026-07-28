import type { AsyncJobItemStatus } from "./async-job-item.js";

export type AsyncJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "PARTIAL_SUCCESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

const transitions: Readonly<Record<AsyncJobStatus, readonly AsyncJobStatus[]>> = Object.freeze({
  QUEUED: ["RUNNING", "CANCELLED"],
  RUNNING: ["PARTIAL_SUCCESS", "COMPLETED", "FAILED", "CANCELLED"],
  PARTIAL_SUCCESS: ["COMPLETED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
});

export interface AsyncJobState {
  readonly id: string;
  readonly status: AsyncJobStatus;
  readonly progressPercent: number;
}

export function canTransitionJob(from: AsyncJobStatus, to: AsyncJobStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionJob(job: AsyncJobState, status: AsyncJobStatus): AsyncJobState {
  if (!canTransitionJob(job.status, status)) {
    throw new Error(`Invalid async job transition: ${job.status} -> ${status}`);
  }
  return Object.freeze({ ...job, status });
}

export function deriveJobStatus(
  items: readonly { readonly status: AsyncJobItemStatus }[],
): AsyncJobStatus {
  if (items.length === 0) return "QUEUED";
  const statuses = items.map((item) => item.status);
  if (statuses.some((status) => status === "RUNNING")) return "RUNNING";
  if (statuses.every((status) => status === "COMPLETED")) return "COMPLETED";
  if (statuses.every((status) => status === "CANCELLED")) return "CANCELLED";
  if (statuses.every((status) => status === "FAILED")) return "FAILED";
  if (
    statuses.some((status) => status === "COMPLETED") &&
    statuses.some((status) => status === "FAILED" || status === "CANCELLED")
  ) {
    return "PARTIAL_SUCCESS";
  }
  return "QUEUED";
}
