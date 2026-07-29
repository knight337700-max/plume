import {
  PlumeBadge,
  PlumeButton,
  PlumeHeading,
  PlumeProgress,
  PlumeStatusDot,
  PlumeText,
  type PlumeProgressStep,
} from "../components/index.js";

export type AsyncJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export interface AsyncJobItem {
  id: string;
  label: string;
  status: AsyncJobStatus;
  progress?: number;
  message?: string;
}

export interface AsyncJobProgressPanelProps {
  title: string;
  status: AsyncJobStatus;
  items: readonly AsyncJobItem[];
  progress?: number;
  currentStep?: PlumeProgressStep;
  onRetry?: (item: AsyncJobItem) => void;
  onCancel?: () => void;
}

const jobStatusLabels: Record<AsyncJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
};

const jobStatusVariants: Record<
  AsyncJobStatus,
  "success" | "warning" | "error" | "accent" | "neutral"
> = {
  queued: "neutral",
  running: "accent",
  paused: "warning",
  completed: "success",
  failed: "error",
  canceled: "neutral",
};

const jobBadgeVariants: Record<
  AsyncJobStatus,
  "success" | "warning" | "error" | "info" | "neutral"
> = {
  queued: "neutral",
  running: "info",
  paused: "warning",
  completed: "success",
  failed: "error",
  canceled: "neutral",
};

function isInFlight(status: AsyncJobStatus) {
  return status === "queued" || status === "running" || status === "paused";
}

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}

export function AsyncJobProgressPanel({
  title,
  status,
  items,
  progress,
  currentStep,
  onRetry,
  onCancel,
}: AsyncJobProgressPanelProps) {
  const statusLabel = jobStatusLabels[status];
  const progressValue = progress === undefined ? undefined : clampProgress(progress);

  return (
    <section
      aria-label={title}
      data-plume-component="async-job-progress-panel"
      data-job-status={status}
    >
      <header data-plume-region="job-summary">
        <PlumeHeading level={2}>{title}</PlumeHeading>
        <PlumeStatusDot
          variant={jobStatusVariants[status]}
          label={statusLabel}
          {...(status === "running" ? { isPulsing: true } : {})}
        />
        <PlumeBadge label={statusLabel} variant={jobBadgeVariants[status]} />
        {currentStep ? (
          <PlumeText type="supporting">
            {currentStep.label ? `${currentStep.label}: ` : ""}
            Step {currentStep.current} of {currentStep.total}
          </PlumeText>
        ) : null}
      </header>

      {isInFlight(status) || progressValue !== undefined ? (
        <PlumeProgress
          label={`${title} progress`}
          isLabelHidden
          {...(progressValue === undefined
            ? { isIndeterminate: true }
            : { value: progressValue, hasValueLabel: true })}
          {...(currentStep ? { currentStep } : {})}
          data-plume-region="job-progress"
        />
      ) : null}

      <ol data-plume-region="job-items">
        {items.map((item) => {
          const itemStatusLabel = jobStatusLabels[item.status];
          const itemProgress =
            item.progress === undefined ? undefined : clampProgress(item.progress);

          return (
            <li
              key={item.id}
              data-job-item-id={item.id}
              data-job-item-status={item.status}
            >
              <PlumeStatusDot
                variant={jobStatusVariants[item.status]}
                label={itemStatusLabel}
                {...(item.status === "running" ? { isPulsing: true } : {})}
              />
              <PlumeText>{item.label}</PlumeText>
              <PlumeBadge
                label={itemStatusLabel}
                variant={jobBadgeVariants[item.status]}
              />
              {itemProgress !== undefined ? (
                <PlumeProgress
                  label={`${item.label} progress`}
                  value={itemProgress}
                  hasValueLabel
                  isLabelHidden
                  data-plume-region="job-item-progress"
                />
              ) : null}
              {item.message ? (
                <PlumeText type="supporting">{item.message}</PlumeText>
              ) : null}
              {item.status === "failed" && onRetry ? (
                <PlumeButton
                  type="button"
                  label={`Retry ${item.label}`}
                  variant="secondary"
                  size="sm"
                  onClick={() => onRetry(item)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {onCancel && isInFlight(status) ? (
        <PlumeButton
          type="button"
          label="Cancel job"
          variant="ghost"
          onClick={onCancel}
          data-plume-region="job-cancel"
        />
      ) : null}
    </section>
  );
}
