import { createHmac, randomUUID } from "node:crypto";
import type { ExportFileRecord, ExportJobRecord, ExportRepositories } from "./repositories.js";

export interface ExportCreateInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly requestedBy: string;
  readonly creativeVersionIds: readonly string[];
  readonly exportRecipeId: string;
  readonly optionsJson?: Readonly<Record<string, unknown>>;
  readonly approvalRequestIds?: Readonly<Record<string, string>>;
  readonly validationRunIds?: Readonly<Record<string, string>>;
}

export interface ExportDownloadUrl {
  readonly file: ExportFileRecord;
  readonly url: string;
  readonly expiresAt: string;
}

export interface ExportUseCases {
  create(input: ExportCreateInput): Promise<ExportJobRecord>;
  list(workspaceId: string, campaignId?: string): Promise<readonly ExportJobRecord[]>;
  get(workspaceId: string, id: string): Promise<ExportJobRecord | null>;
  listFiles(workspaceId: string, exportJobId: string): Promise<readonly ExportFileRecord[]>;
  cancel(workspaceId: string, id: string): Promise<ExportJobRecord>;
  retry(workspaceId: string, id: string): Promise<ExportJobRecord>;
  getDownloadUrl(input: { readonly workspaceId: string; readonly fileId: string; readonly expiresInSeconds?: number }): Promise<ExportDownloadUrl>;
}

function notFound(kind: string): Error {
  const error = new Error(`${kind} not found`);
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

function conflict(code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 409 });
  return error;
}

function ownedFile(files: readonly ExportFileRecord[], fileId: string): ExportFileRecord {
  const file = files.find((candidate) => candidate.id === fileId);
  if (!file) throw notFound("Export file");
  return file;
}

export function createExportUseCases(dependencies: {
  readonly repositories: ExportRepositories;
  readonly signingSecret?: string;
  readonly now?: () => Date;
}): ExportUseCases {
  const now = dependencies.now ?? (() => new Date());
  const signingSecret = dependencies.signingSecret ?? "plume-local-export-download-secret";
  return {
    async create(input) {
      const creativeVersionIds = [...new Set(input.creativeVersionIds)].filter(Boolean);
      if (creativeVersionIds.length === 0) throw conflict("EXPORT_ITEMS_REQUIRED", "At least one Creative version is required");
      const job = await dependencies.repositories.createJob({ ...(input.id === undefined ? {} : { id: input.id }), workspaceId: input.workspaceId, campaignId: input.campaignId, asyncJobId: randomUUID(), exportRecipeId: input.exportRecipeId, optionsJson: { ...(input.optionsJson ?? {}), creativeVersionIds }, requestedBy: input.requestedBy });
      for (const [sortOrder, creativeVersionId] of creativeVersionIds.entries()) {
        await dependencies.repositories.createItem({ workspaceId: input.workspaceId, exportJobId: job.id, creativeVersionId, approvalRequestId: input.approvalRequestIds?.[creativeVersionId] ?? `approval-${creativeVersionId}`, validationRunId: input.validationRunIds?.[creativeVersionId] ?? `validation-${creativeVersionId}`, sortOrder });
      }
      return job;
    },
    list: (workspaceId, campaignId) => dependencies.repositories.listJobs(workspaceId, campaignId),
    get: (workspaceId, id) => dependencies.repositories.getJob(workspaceId, id),
    listFiles: (workspaceId, exportJobId) => dependencies.repositories.listFiles(workspaceId, exportJobId),
    async cancel(workspaceId, id) {
      const job = await dependencies.repositories.getJob(workspaceId, id);
      if (!job) throw notFound("Export job");
      if (job.status === "COMPLETED" || job.status === "EXPIRED" || job.status === "CANCELLED") return job;
      return dependencies.repositories.updateJob(workspaceId, id, { status: "CANCELLED", completedAt: now().toISOString(), errorJson: null });
    },
    async retry(workspaceId, id) {
      const job = await dependencies.repositories.getJob(workspaceId, id);
      if (!job) throw notFound("Export job");
      if (job.status !== "FAILED") throw conflict("EXPORT_RETRY_NOT_ALLOWED", "Only a failed export job can be retried");
      const items = await dependencies.repositories.listItems(workspaceId, id);
      for (const item of items) await dependencies.repositories.updateItem(workspaceId, item.id, { status: "PENDING", errorJson: null });
      return dependencies.repositories.updateJob(workspaceId, id, { status: "QUEUED", completedAt: null, errorJson: null });
    },
    async getDownloadUrl(input) {
      const file = await dependencies.repositories.getFile(input.workspaceId, input.fileId);
      if (!file) throw notFound("Export file");
      const job = await dependencies.repositories.getJob(input.workspaceId, file.exportJobId);
      if (!job) throw notFound("Export job");
      if (job.status !== "COMPLETED") throw conflict("EXPORT_NOT_READY", "Only a completed export can be downloaded");
      if (job.expiresAt && Date.parse(job.expiresAt) <= now().getTime()) throw conflict("EXPORT_EXPIRED", "The export file has expired");
      const expiresAt = new Date(now().getTime() + Math.max(1, input.expiresInSeconds ?? 900) * 1000).toISOString();
      const payload = `${input.workspaceId}:${file.id}:${expiresAt}`;
      const signature = createHmac("sha256", signingSecret).update(payload).digest("base64url");
      return { file, expiresAt, url: `/api/v1/export-files/${encodeURIComponent(file.id)}/download?workspaceId=${encodeURIComponent(input.workspaceId)}&expiresAt=${encodeURIComponent(expiresAt)}&signature=${encodeURIComponent(signature)}` };
    },
  };
}
