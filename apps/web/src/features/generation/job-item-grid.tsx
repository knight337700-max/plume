import {
  AsyncJobProgressPanel,
  type AsyncJobItem,
  type AsyncJobProgressPanelProps,
  type AsyncJobStatus,
} from "@plume/ui";
import type { JobEvent } from "../../stores/job-events.js";

export interface GenerationJobItem {
  readonly id: string;
  readonly jobId: string;
  readonly label: string;
  readonly status: AsyncJobStatus;
  readonly progress?: number;
  readonly message?: string;
}

export interface JobItemGridProps {
  title: string;
  status: AsyncJobStatus;
  items: readonly GenerationJobItem[];
  events?: Readonly<Record<string, JobEvent>>;
  progress?: number;
  currentStep?: AsyncJobProgressPanelProps["currentStep"];
  onRetry?: (item: GenerationJobItem) => void;
  onCancel?: () => void;
}

const eventStatusMap: Record<string, AsyncJobStatus> = {
  queued: "queued",
  running: "running",
  paused: "paused",
  completed: "completed",
  succeeded: "completed",
  failed: "failed",
  canceled: "canceled",
  cancelled: "canceled",
};

function resolveStatus(status: string, fallback: AsyncJobStatus) {
  return eventStatusMap[status.toLowerCase()] ?? fallback;
}

function resolveItem(
  item: GenerationJobItem,
  event: JobEvent | undefined,
): AsyncJobItem {
  return {
    id: item.id,
    label: item.label,
    status: event ? resolveStatus(event.status, item.status) : item.status,
    ...(event?.progressPercent !== undefined
      ? { progress: event.progressPercent }
      : item.progress !== undefined
        ? { progress: item.progress }
        : {}),
    ...(event?.message ?? item.message
      ? { message: event?.message ?? item.message }
      : {}),
  };
}

export function JobItemGrid({
  title,
  status,
  items,
  events = {},
  progress,
  currentStep,
  onRetry,
  onCancel,
}: JobItemGridProps) {
  const resolvedItems = items.map((item) =>
    resolveItem(item, events[item.jobId]),
  );

  return (
    <div
      data-plume-feature="job-item-grid"
      data-job-item-count={String(items.length)}
    >
      <AsyncJobProgressPanel
        title={title}
        status={status}
        items={resolvedItems}
        {...(progress !== undefined ? { progress } : {})}
        {...(currentStep ? { currentStep } : {})}
        {...(onRetry
          ? {
              onRetry: (item: AsyncJobItem) => {
                const sourceItem = items.find((candidate) => candidate.id === item.id);
                if (sourceItem) onRetry(sourceItem);
              },
            }
          : {})}
        {...(onCancel ? { onCancel } : {})}
      />
    </div>
  );
}
