import type { CreativeRepositories } from "../../../core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../core/src/modules/asset/upload-session.js";
import type { ObjectStorage } from "../storage/s3-object-storage.js";
import { assertRendererArtifactObjectKey } from "./project-render-artifact-persistence.js";

export interface CreativeRenderArtifactDownloadService {
  getDownloadUrl(input: {
    workspaceId: string;
    versionId: string;
    renderId: string;
  }): Promise<{ url: string; expiresAt: string; filename: string }>;
}

interface FileObjectReader {
  getFileObject(workspaceId: string, fileObjectId: string): Promise<FileObjectRecord | null>;
}

function notFound(): Error {
  return Object.assign(new Error("Creative render not found"), {
    code: "CREATIVE_RENDER_NOT_FOUND",
    statusCode: 404,
  });
}

function invalidArtifact(): Error {
  return Object.assign(new Error("Creative render artifact is invalid"), {
    code: "CREATIVE_RENDER_ARTIFACT_INVALID",
    statusCode: 422,
  });
}

/** Resolves render identity server-side; callers never provide an object key. */
export class CreativeRenderArtifactDownload implements CreativeRenderArtifactDownloadService {
  public constructor(
    private readonly dependencies: {
      readonly creativeRepositories: Pick<CreativeRepositories, "getVersion" | "listRenders">;
      readonly fileObjects: FileObjectReader;
      readonly storage: ObjectStorage;
      readonly expiresInSeconds?: number;
    },
  ) {}

  public async getDownloadUrl(input: {
    workspaceId: string;
    versionId: string;
    renderId: string;
  }): Promise<{ url: string; expiresAt: string; filename: string }> {
    const version = await this.dependencies.creativeRepositories.getVersion(
      input.workspaceId,
      input.versionId,
    );
    if (!version) throw notFound();
    const render = (
      await this.dependencies.creativeRepositories.listRenders(input.workspaceId, version.id)
    ).find((candidate) => candidate.id === input.renderId);
    if (
      !render ||
      render.workspaceId !== input.workspaceId ||
      render.creativeVersionId !== version.id ||
      render.status !== "COMPLETED"
    )
      throw notFound();
    const fileObject = await this.dependencies.fileObjects.getFileObject(
      input.workspaceId,
      render.fileObjectId,
    );
    if (!fileObject || fileObject.workspaceId !== input.workspaceId) throw notFound();
    try {
      assertRendererArtifactObjectKey(input.workspaceId, fileObject.objectKey);
    } catch {
      throw invalidArtifact();
    }
    const head = await this.dependencies.storage.head(fileObject.objectKey);
    if (
      !head ||
      head.bucket !== fileObject.bucket ||
      head.objectKey !== fileObject.objectKey ||
      head.bytes !== fileObject.bytes ||
      (head.checksumSha256 &&
        head.checksumSha256.toLowerCase() !== fileObject.checksumSha256.toLowerCase())
    )
      throw invalidArtifact();
    const signed = await this.dependencies.storage.presign(fileObject.objectKey, {
      method: "GET",
      expiresInSeconds: this.dependencies.expiresInSeconds ?? 300,
    });
    return { url: signed.url, expiresAt: signed.expiresAt, filename: fileObject.originalFilename };
  }
}
