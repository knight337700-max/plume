import type { AsyncJobItemStatus } from "./async-job-item.js";
import type { AsyncJobStatus } from "./async-job.js";
import type { JobItemRecord, JobRecord } from "./job-repository.js";

export interface JobListFilter {
  readonly status?: AsyncJobStatus;
  readonly jobType?: string;
  readonly limit?: number;
}

export interface JobQueryRepository {
  listJobs(workspaceId: string, filter?: JobListFilter): Promise<readonly JobRecord[]>;
  getJob(workspaceId: string, id: string): Promise<JobRecord | null>;
  listItems(workspaceId: string, jobId: string): Promise<readonly JobItemRecord[]>;
  cancelJob(workspaceId: string, id: string): Promise<JobRecord>;
  retryJob(workspaceId: string, id: string): Promise<JobRecord>;
}

export interface JobUseCases {
  list(workspaceId: string, filter?: JobListFilter): Promise<readonly JobRecord[]>;
  get(workspaceId: string, id: string): Promise<JobRecord | null>;
  listItems(workspaceId: string, id: string): Promise<readonly JobItemRecord[]>;
  cancel(workspaceId: string, id: string): Promise<JobRecord>;
  retry(workspaceId: string, id: string): Promise<JobRecord>;
}

function notFound(): Error {
  const error = new Error("Job not found");
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

function conflict(code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 409 });
  return error;
}

export function createJobUseCases(repository: JobQueryRepository): JobUseCases {
  return {
    list: (workspaceId, filter) => repository.listJobs(workspaceId, filter),
    get: (workspaceId, id) => repository.getJob(workspaceId, id),
    async listItems(workspaceId, id) {
      const job = await repository.getJob(workspaceId, id);
      if (!job) throw notFound();
      return repository.listItems(workspaceId, id);
    },
    async cancel(workspaceId, id) {
      const job = await repository.getJob(workspaceId, id);
      if (!job) throw notFound();
      if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") return job;
      return repository.cancelJob(workspaceId, id);
    },
    async retry(workspaceId, id) {
      const job = await repository.getJob(workspaceId, id);
      if (!job) throw notFound();
      if (job.status !== "FAILED" && job.status !== "PARTIAL_SUCCESS") throw conflict("JOB_NOT_RETRYABLE", "Only a failed or partial job can be retried");
      return repository.retryJob(workspaceId, id);
    },
  };
}

export function createInMemoryJobQueryRepository(seed: { readonly jobs?: readonly JobRecord[]; readonly items?: readonly JobItemRecord[] } = {}): JobQueryRepository {
  const jobs = new Map(seed.jobs?.map((job) => [job.id, job]) ?? []);
  const items = new Map(seed.items?.map((item) => [item.id, item]) ?? []);
  return {
    async listJobs(workspaceId, filter) {
      return [...jobs.values()].filter((job) => job.workspaceId === workspaceId && (filter?.status === undefined || job.status === filter.status)).sort((left, right) => right.id.localeCompare(left.id));
    },
    async getJob(workspaceId, id) {
      const job = jobs.get(id);
      return job?.workspaceId === workspaceId ? job : null;
    },
    async listItems(workspaceId, jobId) {
      const job = jobs.get(jobId);
      if (!job || job.workspaceId !== workspaceId) throw notFound();
      return [...items.values()].filter((item) => item.jobId === jobId).sort((left, right) => left.itemKey.localeCompare(right.itemKey));
    },
    async cancelJob(workspaceId, id) {
      const job = jobs.get(id);
      if (!job || job.workspaceId !== workspaceId) throw notFound();
      const updated = Object.freeze({ ...job, status: "CANCELLED" as const });
      jobs.set(id, updated);
      for (const item of items.values()) if (item.jobId === id && item.status !== "COMPLETED") items.set(item.id, Object.freeze({ ...item, status: "CANCELLED" as AsyncJobItemStatus }));
      return updated;
    },
    async retryJob(workspaceId, id) {
      const job = jobs.get(id);
      if (!job || job.workspaceId !== workspaceId) throw notFound();
      const updated = Object.freeze({ ...job, status: "QUEUED" as const, attemptNo: job.attemptNo + 1, progressPercent: 0 });
      jobs.set(id, updated);
      for (const item of items.values()) if (item.jobId === id && item.status !== "COMPLETED") items.set(item.id, Object.freeze({ ...item, status: "QUEUED" as AsyncJobItemStatus, progressPercent: 0 }));
      return updated;
    },
  };
}

