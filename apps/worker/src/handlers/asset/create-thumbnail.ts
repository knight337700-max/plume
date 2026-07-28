import { createThumbnail, type ThumbnailConfig, type ThumbnailResult } from "../../../../../packages/infrastructure/src/images/create-thumbnail.js";

export interface ThumbnailSource { read(objectKey: string): Promise<Uint8Array> }
export interface ThumbnailFileObject { readonly id: string; readonly workspaceId: string; readonly assetVersionId: string; readonly objectKey: string; readonly mimeType: string; readonly bytes: number; readonly checksumSha256: string; readonly metadataJson: Readonly<Record<string, unknown>> }
export interface ThumbnailStore { save(fileObject: ThumbnailFileObject, bytes: Uint8Array): Promise<void> }
export interface CreateThumbnailInput { readonly workspaceId: string; readonly assetVersionId: string; readonly objectKey: string; readonly mimeType: string; readonly config: ThumbnailConfig }

export function createThumbnailHandler(dependencies: { readonly source: ThumbnailSource; readonly store: ThumbnailStore }) {
  return async (input: CreateThumbnailInput): Promise<ThumbnailFileObject & { readonly thumbnail: ThumbnailResult }> => {
    const result = createThumbnail(await dependencies.source.read(input.objectKey), input.mimeType, input.config);
    const fileObject: ThumbnailFileObject = { id: `thumb-${result.checksumSha256.slice(0, 24)}`, workspaceId: input.workspaceId, assetVersionId: input.assetVersionId, objectKey: `thumbnails/${input.assetVersionId}/${result.checksumSha256}`, mimeType: result.mimeType, bytes: result.bytes.byteLength, checksumSha256: result.checksumSha256, metadataJson: result.metadataJson };
    await dependencies.store.save(fileObject, result.bytes);
    return { ...fileObject, thumbnail: result };
  };
}
