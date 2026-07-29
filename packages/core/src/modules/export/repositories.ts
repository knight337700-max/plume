import { randomUUID } from "node:crypto";

export type ExportJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
export type ExportItemStatus = "PENDING" | "COMPLETED" | "FAILED";
export type ExportFileRole = "CREATIVE" | "PREVIEW" | "MANIFEST" | "VALIDATION_REPORT" | "COPY_CSV" | "PACKAGE" | "SOURCE";

export interface ExportJobRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly asyncJobId?: string | null;
  readonly exportRecipeId: string;
  readonly status: ExportJobStatus;
  readonly optionsJson: Readonly<Record<string, unknown>>;
  readonly manifestJson?: Readonly<Record<string, unknown>> | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly completedAt?: string | null;
  readonly expiresAt?: string | null;
  readonly errorJson?: Readonly<Record<string, unknown>> | null;
}

export interface ExportItemRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly exportJobId: string;
  readonly creativeVersionId: string;
  readonly approvalRequestId: string;
  readonly validationRunId: string;
  readonly sortOrder: number;
  readonly status: ExportItemStatus;
  readonly errorJson?: Readonly<Record<string, unknown>> | null;
  readonly checkpointJson?: Readonly<Record<string, unknown>> | null;
}

export interface ExportFileRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly exportJobId: string;
  readonly exportItemId?: string | null;
  readonly fileObjectId: string;
  readonly fileRole: ExportFileRole;
  readonly relativePath: string;
  readonly bytes?: number;
  readonly checksumSha256?: string;
}

export interface CreateExportJobInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly asyncJobId?: string | null;
  readonly exportRecipeId: string;
  readonly optionsJson?: Readonly<Record<string, unknown>>;
  readonly requestedBy: string;
  readonly requestedAt?: string;
  readonly expiresAt?: string | null;
}

export interface CreateExportItemInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly exportJobId: string;
  readonly creativeVersionId: string;
  readonly approvalRequestId: string;
  readonly validationRunId: string;
  readonly sortOrder: number;
}

export interface CreateExportFileInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly exportJobId: string;
  readonly exportItemId?: string | null;
  readonly fileObjectId: string;
  readonly fileRole: ExportFileRole;
  readonly relativePath: string;
  readonly bytes?: number;
  readonly checksumSha256?: string;
}

export interface ExportRepositories {
  createJob(input: CreateExportJobInput): Promise<ExportJobRecord>;
  getJob(workspaceId: string, id: string): Promise<ExportJobRecord | null>;
  listJobs(workspaceId: string, campaignId?: string): Promise<readonly ExportJobRecord[]>;
  updateJob(workspaceId: string, id: string, patch: Partial<Pick<ExportJobRecord, "status" | "manifestJson" | "completedAt" | "errorJson">>): Promise<ExportJobRecord>;
  createItem(input: CreateExportItemInput): Promise<ExportItemRecord>;
  listItems(workspaceId: string, exportJobId: string): Promise<readonly ExportItemRecord[]>;
  updateItem(workspaceId: string, id: string, patch: Partial<Pick<ExportItemRecord, "status" | "errorJson" | "checkpointJson">>): Promise<ExportItemRecord>;
  appendFile(input: CreateExportFileInput): Promise<ExportFileRecord>;
  listFiles(workspaceId: string, exportJobId: string): Promise<readonly ExportFileRecord[]>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function notFound(kind: string): Error {
  const error = new Error(`${kind} not found`);
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

export function createInMemoryExportRepositories(seed: {
  readonly jobs?: readonly ExportJobRecord[];
  readonly items?: readonly ExportItemRecord[];
  readonly files?: readonly ExportFileRecord[];
} = {}): ExportRepositories {
  const jobs = new Map(seed.jobs?.map((item) => [item.id, item]) ?? []);
  const items = new Map(seed.items?.map((item) => [item.id, item]) ?? []);
  const files = new Map(seed.files?.map((item) => [item.id, item]) ?? []);
  return {
    async createJob(input) {
      const job: ExportJobRecord = Object.freeze({
        id: input.id ?? randomUUID(), workspaceId: input.workspaceId, campaignId: input.campaignId,
        ...(input.asyncJobId === undefined ? {} : { asyncJobId: input.asyncJobId }),
        exportRecipeId: input.exportRecipeId, status: "QUEUED", optionsJson: Object.freeze(clone(input.optionsJson ?? {})),
        requestedBy: input.requestedBy, requestedAt: input.requestedAt ?? new Date().toISOString(),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      });
      jobs.set(job.id, job);
      return job;
    },
    async getJob(workspaceId, id) {
      const job = jobs.get(id);
      return job?.workspaceId === workspaceId ? job : null;
    },
    async listJobs(workspaceId, campaignId) {
      return [...jobs.values()].filter((job) => job.workspaceId === workspaceId && (campaignId === undefined || job.campaignId === campaignId)).sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    },
    async updateJob(workspaceId, id, patch) {
      const current = jobs.get(id);
      if (!current || current.workspaceId !== workspaceId) throw notFound("Export job");
      const updated: ExportJobRecord = Object.freeze({
        ...current,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.manifestJson === undefined ? {} : { manifestJson: patch.manifestJson === null ? null : Object.freeze(clone(patch.manifestJson)) }),
        ...(patch.completedAt === undefined ? {} : { completedAt: patch.completedAt }),
        ...(patch.errorJson === undefined ? {} : { errorJson: patch.errorJson === null ? null : Object.freeze(clone(patch.errorJson)) }),
      });
      jobs.set(id, updated);
      return updated;
    },
    async createItem(input) {
      const job = jobs.get(input.exportJobId);
      if (!job || job.workspaceId !== input.workspaceId) throw notFound("Export job");
      const item: ExportItemRecord = Object.freeze({ id: input.id ?? randomUUID(), ...input, status: "PENDING" });
      items.set(item.id, item);
      return item;
    },
    async listItems(workspaceId, exportJobId) {
      const job = jobs.get(exportJobId);
      if (!job || job.workspaceId !== workspaceId) throw notFound("Export job");
      return [...items.values()].filter((item) => item.workspaceId === workspaceId && item.exportJobId === exportJobId).sort((left, right) => left.sortOrder - right.sortOrder);
    },
    async updateItem(workspaceId, id, patch) {
      const current = items.get(id);
      if (!current || current.workspaceId !== workspaceId) throw notFound("Export item");
      const updated: ExportItemRecord = Object.freeze({
        ...current,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.errorJson === undefined ? {} : { errorJson: patch.errorJson === null ? null : Object.freeze(clone(patch.errorJson)) }),
        ...(patch.checkpointJson === undefined ? {} : { checkpointJson: patch.checkpointJson === null ? null : Object.freeze(clone(patch.checkpointJson)) }),
      });
      items.set(id, updated);
      return updated;
    },
    async appendFile(input) {
      const job = jobs.get(input.exportJobId);
      if (!job || job.workspaceId !== input.workspaceId) throw notFound("Export job");
      const duplicate = [...files.values()].find((file) => file.exportJobId === input.exportJobId && file.relativePath === input.relativePath);
      if (duplicate) return duplicate;
      const file: ExportFileRecord = Object.freeze({ id: input.id ?? randomUUID(), ...input });
      files.set(file.id, file);
      return file;
    },
    async listFiles(workspaceId, exportJobId) {
      const job = jobs.get(exportJobId);
      if (!job || job.workspaceId !== workspaceId) throw notFound("Export job");
      return [...files.values()].filter((file) => file.workspaceId === workspaceId && file.exportJobId === exportJobId).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    },
  };
}

