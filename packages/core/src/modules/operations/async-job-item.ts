export type AsyncJobItemStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

const transitions: Readonly<Record<AsyncJobItemStatus, readonly AsyncJobItemStatus[]>> =
  Object.freeze({
    QUEUED: ["RUNNING", "CANCELLED"],
    RUNNING: ["COMPLETED", "FAILED", "CANCELLED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
  });

export interface AsyncJobItemState {
  readonly id: string;
  readonly status: AsyncJobItemStatus;
  readonly progressPercent: number;
}

export function canTransitionItem(from: AsyncJobItemStatus, to: AsyncJobItemStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionItem(
  item: AsyncJobItemState,
  status: AsyncJobItemStatus,
): AsyncJobItemState {
  if (!canTransitionItem(item.status, status)) {
    throw new Error(`Invalid async job item transition: ${item.status} -> ${status}`);
  }
  return Object.freeze({ ...item, status });
}
