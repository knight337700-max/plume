import { createHash, randomUUID } from "node:crypto";
import {
  createInMemoryUploadSessionRepository,
  createUploadId,
  type FileObjectRecord,
  type UploadMode,
  type UploadPartRecord,
  type UploadPurpose,
  type UploadSessionRecord,
  type UploadStatus,
  type UploadSessionRepository,
  uploadError,
} from "./upload-session.js";

export interface UploadStorage {
  createObjectKey(purpose?: string): string;
  presign(objectKey: string, options?: { method?: "GET" | "PUT"; expiresInSeconds?: number }): Promise<{ url: string; expiresAt: string; method: "GET" | "PUT" }>;
  deleteTemp(objectKey: string): Promise<void>;
}

export interface UploadVerificationInput {
  readonly session: UploadSessionRecord;
  readonly checksumSha256: string;
  readonly parts: readonly { partNumber: number; etag: string }[];
}

export interface UploadVerificationResult {
  readonly checksumSha256: string;
  readonly bytes: number;
  readonly metadataJson?: Readonly<Record<string, unknown>>;
}

export interface UploadVerifier {
  verify(input: UploadVerificationInput): Promise<UploadVerificationResult>;
}

export interface UploadUseCaseDependencies {
  readonly repository?: UploadSessionRepository;
  readonly storage: UploadStorage;
  readonly verifier?: UploadVerifier;
  readonly bucket: string;
  readonly now?: () => Date;
  readonly expirySeconds?: number;
}

export interface CreateUploadInput {
  readonly workspaceId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly checksumSha256?: string | null;
  readonly purpose: UploadPurpose;
  readonly multipartPreferred?: boolean;
}

export interface UploadSessionDto {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: UploadStatus;
  readonly mode: UploadMode;
  readonly expiresAt: string;
  readonly objectKeyToken: string;
  readonly singleUploadUrl: string | null;
  readonly parts: readonly UploadPartRecord[];
  readonly constraints: Readonly<Record<string, unknown>>;
}

export interface CompleteUploadInput {
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly checksumSha256: string;
  readonly parts?: readonly { partNumber: number; etag: string }[];
}

export interface UploadUseCases {
  create(input: CreateUploadInput): Promise<UploadSessionDto>;
  get(workspaceId: string, uploadId: string): Promise<UploadSessionDto>;
  createParts(workspaceId: string, uploadId: string, partNumbers: readonly number[]): Promise<{ parts: readonly UploadPartRecord[] }>;
  complete(input: CompleteUploadInput): Promise<FileObjectRecord>;
  abort(workspaceId: string, uploadId: string): Promise<void>;
  getFile(workspaceId: string, fileId: string): Promise<FileObjectRecord>;
  getDownloadUrl(workspaceId: string, fileId: string): Promise<{ url: string; expiresAt: string; filename: string }>;
}

const defaultVerifier: UploadVerifier = {
  async verify(input) {
    if (input.session.checksumSha256 && input.session.checksumSha256 !== input.checksumSha256) throw uploadError("CHECKSUM_MISMATCH", "Upload checksum does not match the declared checksum", 422);
    if (input.session.bytes < 1) throw uploadError("INVALID_UPLOAD_SIZE", "Upload must contain at least one byte", 422);
    return { checksumSha256: input.checksumSha256, bytes: input.session.bytes, metadataJson: {} };
  },
};

const dto = (session: UploadSessionRecord, singleUploadUrl: string | null): UploadSessionDto => ({
  id: session.id,
  workspaceId: session.workspaceId,
  status: session.status,
  mode: session.mode,
  expiresAt: session.expiresAt,
  objectKeyToken: session.objectKey,
  singleUploadUrl,
  parts: session.parts,
  constraints: { filename: session.filename, mimeType: session.mimeType, bytes: session.bytes, purpose: session.purpose },
});

export function createUploadUseCases(dependencies: UploadUseCaseDependencies): UploadUseCases {
  const repository = dependencies.repository ?? createInMemoryUploadSessionRepository();
  const verifier = dependencies.verifier ?? defaultVerifier;
  const expirySeconds = dependencies.expirySeconds ?? 900;
  const now = dependencies.now ?? (() => new Date());
  const currentTime = () => now().toISOString();
  const assertSession = async (workspaceId: string, uploadId: string): Promise<UploadSessionRecord> => {
    const session = await repository.get(workspaceId, uploadId);
    if (!session) throw uploadError("UPLOAD_NOT_FOUND", "Upload session not found", 404);
    if (session.expiresAt < currentTime() && ["CREATED", "UPLOADING"].includes(session.status)) {
      await repository.update(uploadId, { status: "EXPIRED", updatedAt: currentTime() });
      throw uploadError("UPLOAD_EXPIRED", "Upload session has expired", 409);
    }
    return session;
  };

  return {
    async create(input) {
      if (input.bytes < 1) throw uploadError("INVALID_UPLOAD_SIZE", "Upload must contain at least one byte", 422);
      const createdAt = currentTime();
      const expiresAt = new Date(now().getTime() + expirySeconds * 1000).toISOString();
      const mode: UploadMode = input.multipartPreferred ? "MULTIPART" : "SINGLE";
      const session: UploadSessionRecord = {
        id: createUploadId(), workspaceId: input.workspaceId, status: "CREATED", mode, filename: input.filename,
        mimeType: input.mimeType, bytes: input.bytes, ...(input.checksumSha256 ? { checksumSha256: input.checksumSha256 } : {}), purpose: input.purpose,
        objectKey: dependencies.storage.createObjectKey("uploads"), bucket: dependencies.bucket, expiresAt, parts: [], createdAt, updatedAt: createdAt,
      };
      await repository.create(session);
      let singleUploadUrl: string | null = null;
      if (mode === "SINGLE") singleUploadUrl = (await dependencies.storage.presign(session.objectKey, { method: "PUT", expiresInSeconds: expirySeconds })).url;
      return dto(session, singleUploadUrl);
    },
    async get(workspaceId, uploadId) {
      const session = await assertSession(workspaceId, uploadId);
      return dto(session, null);
    },
    async createParts(workspaceId, uploadId, partNumbers) {
      const session = await assertSession(workspaceId, uploadId);
      if (session.mode !== "MULTIPART") throw uploadError("UPLOAD_MODE_MISMATCH", "Parts are only available for multipart uploads", 409);
      const unique = [...new Set(partNumbers)].filter((partNumber) => Number.isInteger(partNumber) && partNumber > 0).sort((a, b) => a - b);
      if (unique.length !== partNumbers.length || unique.length === 0) throw uploadError("INVALID_PARTS", "Part numbers must be unique positive integers", 422);
      const existing = new Map(session.parts.map((part) => [part.partNumber, part]));
      const parts: UploadPartRecord[] = [];
      for (const partNumber of unique) {
        const current = existing.get(partNumber);
        if (current) { parts.push(current); continue; }
        const signed = await dependencies.storage.presign(`${session.objectKey}/part-${partNumber}`, { method: "PUT", expiresInSeconds: expirySeconds });
        parts.push({ partNumber, url: signed.url, expiresAt: signed.expiresAt });
      }
      const merged = new Map(existing);
      for (const part of parts) merged.set(part.partNumber, part);
      const updated = await repository.update(uploadId, { status: "UPLOADING", parts: [...merged.values()].sort((a, b) => a.partNumber - b.partNumber), updatedAt: currentTime() });
      return { parts: updated.parts };
    },
    async complete(input) {
      const session = await assertSession(input.workspaceId, input.uploadId);
      if (session.status === "COMPLETED" && session.fileObjectId) {
        const existing = await repository.getFileObject(input.workspaceId, session.fileObjectId);
        if (existing) return existing;
      }
      if (session.status === "ABORTED" || session.status === "FAILED") throw uploadError("UPLOAD_NOT_COMPLETABLE", "Upload session cannot be completed in its current state", 409);
      const parts = input.parts ?? [];
      if (session.mode === "MULTIPART" && (parts.length === 0 || parts.some((part) => !session.parts.some((known) => known.partNumber === part.partNumber)))) throw uploadError("MISSING_UPLOAD_PARTS", "All multipart parts must be supplied", 422);
      const verification = await verifier.verify({ session, checksumSha256: input.checksumSha256, parts });
      const fileObject: FileObjectRecord = {
        id: randomUUID(), workspaceId: session.workspaceId, storageProvider: "S3", bucket: session.bucket, objectKey: session.objectKey,
        originalFilename: session.filename, mimeType: session.mimeType, bytes: verification.bytes, checksumSha256: verification.checksumSha256,
        metadataJson: verification.metadataJson ?? {}, createdAt: currentTime(),
      };
      const persisted = await repository.createFileObject(fileObject);
      await repository.update(session.id, { status: "COMPLETED", fileObjectId: persisted.id, updatedAt: currentTime() });
      return persisted;
    },
    async abort(workspaceId, uploadId) {
      const session = await assertSession(workspaceId, uploadId).catch((error: unknown) => {
        if (error instanceof Error && (error as Error & { code?: string }).code === "UPLOAD_EXPIRED") return null;
        throw error;
      });
      if (!session) return;
      if (session.status === "ABORTED") return;
      if (session.status === "COMPLETED") throw uploadError("UPLOAD_ALREADY_COMPLETED", "Completed uploads cannot be aborted", 409);
      await repository.update(session.id, { status: "ABORTED", updatedAt: currentTime() });
      await dependencies.storage.deleteTemp(session.objectKey);
    },
    async getFile(workspaceId, fileId) {
      const file = await repository.getFileObject(workspaceId, fileId);
      if (!file) throw uploadError("FILE_NOT_FOUND", "File object not found", 404);
      return file;
    },
    async getDownloadUrl(workspaceId, fileId) {
      const file = await repository.getFileObject(workspaceId, fileId);
      if (!file) throw uploadError("FILE_NOT_FOUND", "File object not found", 404);
      const signed = await dependencies.storage.presign(file.objectKey, { method: "GET", expiresInSeconds: 300 });
      return { url: signed.url, expiresAt: signed.expiresAt, filename: file.originalFilename };
    },
  };
}

export function createDeterministicUploadStorage(): UploadStorage {
  return {
    createObjectKey(purpose = "uploads") { return `${purpose}/${randomUUID()}`; },
    async presign(objectKey, options = {}) { const expiresAt = new Date(Date.now() + (options.expiresInSeconds ?? 900) * 1000).toISOString(); return { url: `https://storage.invalid/${encodeURIComponent(objectKey)}`, expiresAt, method: options.method ?? "GET" }; },
    async deleteTemp() { return undefined; },
  };
}
