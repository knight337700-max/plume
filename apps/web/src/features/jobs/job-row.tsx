import {
  PlumeBadge,
  PlumeButton,
  PlumeProgress,
  PlumeText,
  type AsyncJobStatus,
} from "@plume/ui";

export interface JobRecord {
  readonly id: string;
  readonly label: string;
  readonly status: AsyncJobStatus;
  readonly progress?: number;
  readonly message?: string;
}

export interface JobRowProps {
  job: JobRecord;
  canManage?: boolean;
  onRetry?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
}

function isInFlight(status: AsyncJobStatus) {
  return status === "queued" || status === "running" || status === "paused";
}

export function JobRow({
  job,
  canManage = false,
  onRetry,
  onCancel,
}: JobRowProps) {
  return (
    <li data-job-id={job.id} data-job-status={job.status}>
      <PlumeText>{job.label}</PlumeText>
      <PlumeBadge label={job.status} variant={job.status === "failed" ? "error" : job.status === "completed" ? "success" : "info"} />
      {job.progress !== undefined ? (
        <PlumeProgress
          label={`${job.label} progress`}
          value={Math.min(100, Math.max(0, job.progress))}
          hasValueLabel
          isLabelHidden
          data-job-progress="true"
        />
      ) : null}
      {job.message ? <PlumeText type="supporting">{job.message}</PlumeText> : null}
      {canManage && job.status === "failed" && onRetry ? (
        <PlumeButton
          type="button"
          label="Retry job"
          variant="secondary"
          onClick={() => onRetry(job.id)}
          data-job-action="retry"
        />
      ) : null}
      {canManage && isInFlight(job.status) && onCancel ? (
        <PlumeButton
          type="button"
          label="Cancel job"
          variant="ghost"
          onClick={() => onCancel(job.id)}
          data-job-action="cancel"
        />
      ) : null}
    </li>
  );
}
