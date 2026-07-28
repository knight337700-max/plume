import { randomUUID } from "node:crypto";

export type UploadStatus = "CREATED" | "UPLOADING" | "COMPLETED" | "ABORTED" | "EXPIRED" | "FAILED";
export type UploadMode = "SINGLE" | "MULTIPART";
export type UploadPurpose = "ASSET" | "CAMPAIGN_SOURCE" | "CATALOG_SOURCE" | "IMPORT";

export interface UploadPartRecord {
  readonly partNumber: number;
  readonly etag?: string;
  readonly url?: string;
  readonly expiresAt?: string;
}

export interface UploadSessionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: UploadStatus;
  readonly mode: UploadMode;
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly checksumSha256?: string;
  readonly purpose: UploadPurpose;
  readonly objectKey: string;
  readonly bucket: string;
  readonly expiresAt: string;
  readonly parts: readonly UploadPartRecord[];
  readonly fileObjectId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FileObjectRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly storageProvider: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly checksumSha256: string;
  readonly metadataJson: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface UploadSessionRepository {
  create(session: UploadSessionRecord): Promise<UploadSessionRecord>;
  get(workspaceId: string, id: string): Promise<UploadSessionRecord | null>;
  update(id: string, patch: Partial<UploadSessionRecord>): Promise<UploadSessionRecord>;
  createFileObject(fileObject: FileObjectRecord): Promise<FileObjectRecord>;
  getFileObject(workspaceId: string, id: string): Promise<FileObjectRecord | null>;
}

export function createInMemoryUploadSessionRepository(): UploadSessionRepository {
  const sessions = new Map<string, UploadSessionRecord>();
  const files = new Map<string, FileObjectRecord>();
  return {
    async create(session) { sessions.set(session.id, Object.freeze({ ...session })); return session; },
    async get(workspaceId, id) { const session = sessions.get(id); return session?.workspaceId === workspaceId ? session : null; },
    async update(id, patch) { const current = sessions.get(id); if (!current) throw uploadError("UPLOAD_NOT_FOUND", "Upload session not found", 404); const next = Object.freeze({ ...current, ...patch }); sessions.set(id, next); return next; },
    async createFileObject(fileObject) { const existing = files.get(fileObject.id); if (existing) return existing; files.set(fileObject.id, Object.freeze({ ...fileObject })); return fileObject; },
    async getFileObject(workspaceId, id) { const file = files.get(id); return file?.workspaceId === workspaceId ? file : null; },
  };
}

export function uploadError(code: string, message: string, statusCode: number): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode });
  return error;
}

export const createUploadId = (): string => randomUUID();
