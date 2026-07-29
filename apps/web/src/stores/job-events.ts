import { useSyncExternalStore } from "react";
import type { WorkspaceEvent, WorkspaceEventSubscription } from "../api/sse.js";

export interface JobEventPayload {
  readonly jobId: string;
  readonly status: string;
  readonly progressPercent?: number;
  readonly currentStep?: string;
  readonly message?: string;
}

export interface JobEvent extends JobEventPayload {
  readonly id: string;
  readonly event: string;
}

export interface JobEventsSnapshot {
  readonly byJobId: Readonly<Record<string, JobEvent>>;
  readonly lastEventId?: string;
}

export interface JobEventsStore {
  getSnapshot(): JobEventsSnapshot;
  getJob(jobId: string): JobEvent | undefined;
  subscribe(listener: () => void): () => void;
  apply(event: WorkspaceEvent): boolean;
  attach(subscription: Pick<WorkspaceEventSubscription, "close">): () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toJobPayload(value: unknown): JobEventPayload | undefined {
  if (!isRecord(value) || typeof value.jobId !== "string" || typeof value.status !== "string") return undefined;
  return {
    jobId: value.jobId,
    status: value.status,
    ...(typeof value.progressPercent === "number" ? { progressPercent: value.progressPercent } : {}),
    ...(typeof value.currentStep === "string" ? { currentStep: value.currentStep } : {}),
    ...(typeof value.message === "string" ? { message: value.message } : {}),
  };
}

export function createJobEventsStore(): JobEventsStore {
  let snapshot: JobEventsSnapshot = { byJobId: {} };
  const listeners = new Set<() => void>();
  const seenEventIds = new Set<string>();
  return {
    getSnapshot() { return snapshot; },
    getJob(jobId) { return snapshot.byJobId[jobId]; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply(event) {
      if (event.id && seenEventIds.has(event.id)) return false;
      const payload = toJobPayload(event.data);
      if (!payload) return false;
      if (event.id) seenEventIds.add(event.id);
      const jobEvent: JobEvent = { ...payload, id: event.id, event: event.event };
      snapshot = {
        byJobId: { ...snapshot.byJobId, [payload.jobId]: jobEvent },
        ...(event.id ? { lastEventId: event.id } : {}),
      };
      for (const listener of listeners) listener();
      return true;
    },
    attach(subscription) { return () => subscription.close(); },
  };
}

export function useJobEvent(store: JobEventsStore, jobId: string) {
  return useSyncExternalStore(store.subscribe, () => store.getJob(jobId), () => undefined);
}
