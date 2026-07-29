import { useSyncExternalStore } from "react";
import {
  PlumeBanner,
  PlumeHeading,
  PlumeText,
  type AsyncJobStatus,
} from "@plume/ui";
import {
  createJobEventsStore,
  type JobEventsStore,
} from "../../stores/job-events.js";
import {
  JobItemGrid,
  type GenerationJobItem,
} from "../../features/generation/job-item-grid.js";

export type GenerationProgressState =
  | "queued"
  | "running"
  | "partial_success"
  | "completed"
  | "failed"
  | "canceled";

export interface GenerationProgressScreenProps {
  jobId?: string;
  items?: readonly GenerationJobItem[];
  state?: GenerationProgressState;
  progress?: number;
  currentStep?: { current: number; total: number; label?: string };
  jobEventsStore?: JobEventsStore;
  onRetry?: (item: GenerationJobItem) => void;
  onCancel?: () => void;
}

const fallbackJobEventsStore = createJobEventsStore();

function toPanelStatus(state: GenerationProgressState): AsyncJobStatus {
  return state === "partial_success" ? "failed" : state;
}

export function GenerationProgressScreen({
  jobId = "generation-job",
  items = [],
  state = "running",
  progress,
  currentStep,
  jobEventsStore,
  onRetry,
  onCancel,
}: GenerationProgressScreenProps) {
  const eventStore = jobEventsStore ?? fallbackJobEventsStore;
  const eventSnapshot = useSyncExternalStore(
    eventStore.subscribe,
    eventStore.getSnapshot,
    eventStore.getSnapshot,
  );
  const completedCount = items.filter(
    (item) =>
      eventSnapshot.byJobId[item.jobId]?.status === "completed" ||
      eventSnapshot.byJobId[item.jobId]?.status === "succeeded" ||
      item.status === "completed",
  ).length;

  return (
    <main data-screen-id="GEN-02" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Generation progress</PlumeHeading>
        <PlumeText type="supporting">
          Job {jobId} · {completedCount} of {items.length} creatives complete
        </PlumeText>
      </header>
      {state === "partial_success" ? (
        <PlumeBanner
          status="warning"
          title="Generation partially completed"
          description="Some creatives are ready while failed items can be retried."
        />
      ) : null}
      <JobItemGrid
        title="Creative generation job"
        status={toPanelStatus(state)}
        items={items}
        events={eventSnapshot.byJobId}
        {...(progress !== undefined ? { progress } : {})}
        {...(currentStep ? { currentStep } : {})}
        {...(onRetry ? { onRetry } : {})}
        {...(onCancel ? { onCancel } : {})}
      />
    </main>
  );
}
