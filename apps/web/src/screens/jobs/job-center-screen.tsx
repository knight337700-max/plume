import { PlumeBanner, PlumeEmptyState, PlumeHeading, PlumeText } from "@plume/ui";
import { canRolePerform } from "../../app/route-guards.js";
import type { WorkspaceRole } from "../../app/workspace-provider.js";
import { JobRow, type JobRecord } from "../../features/jobs/job-row.js";

export type JobCenterState = "loading" | "ready" | "empty" | "error";

export interface JobCenterScreenProps {
  jobs?: readonly JobRecord[];
  role?: WorkspaceRole;
  state?: JobCenterState;
  onRetry?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
}

export function JobCenterScreen({
  jobs = [],
  role,
  state = jobs.length === 0 ? "empty" : "ready",
  onRetry,
  onCancel,
}: JobCenterScreenProps) {
  const canManage = canRolePerform(role, "jobs.manage");

  return (
    <main data-screen-id="JOB-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Job center</PlumeHeading>
        <PlumeText type="supporting">Monitor asynchronous work across this workspace.</PlumeText>
      </header>
      {!canManage ? (
        <PlumeBanner
          status="info"
          title="Read-only job center"
          description="Retry and cancel actions require job management permission."
        />
      ) : null}
      {state === "loading" ? <PlumeText>Loading jobs…</PlumeText> : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Jobs unavailable"
          description="Try refreshing the job center."
        />
      ) : null}
      {state === "empty" ? (
        <PlumeEmptyState title="No jobs" description="New generation, render, and export jobs will appear here." />
      ) : null}
      {state === "ready" ? (
        <ol aria-label="Workspace jobs">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              canManage={canManage}
              {...(onRetry ? { onRetry } : {})}
              {...(onCancel ? { onCancel } : {})}
            />
          ))}
        </ol>
      ) : null}
    </main>
  );
}
