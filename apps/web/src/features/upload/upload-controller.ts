export type UploadFileStatus = "queued" | "uploading" | "completed" | "failed";

export interface UploadFileProgress {
  readonly id: string;
  readonly filename: string;
  readonly bytesUploaded: number;
  readonly totalBytes: number;
  readonly progressPercent: number;
  readonly status: UploadFileStatus;
  readonly errorMessage?: string;
}

export function createUploadFileProgress(input: Pick<UploadFileProgress, "id" | "filename" | "totalBytes">): UploadFileProgress {
  return { ...input, bytesUploaded: 0, progressPercent: 0, status: "queued" };
}

export function updateUploadFileProgress(file: UploadFileProgress, bytesUploaded: number, status: UploadFileStatus = "uploading", errorMessage?: string): UploadFileProgress {
  const bytes = Math.min(file.totalBytes, Math.max(0, bytesUploaded));
  const progressPercent = file.totalBytes === 0 ? 0 : Math.round((bytes / file.totalBytes) * 100);
  return {
    ...file,
    bytesUploaded: bytes,
    progressPercent,
    status,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function applyUploadFailure(file: UploadFileProgress, errorMessage: string) {
  return updateUploadFileProgress(file, file.bytesUploaded, "failed", errorMessage);
}
