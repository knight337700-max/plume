import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Sql } from "postgres";
import type { CreativeRenderRecord } from "../../../core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../core/src/modules/asset/upload-session.js";
import type { ObjectStorage } from "../storage/s3-object-storage.js";
import { persistFileObject } from "./upload-session-repository.js";

export interface ProjectRenderArtifactContext {
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly jobItemId: string;
  readonly messageId: string;
  readonly creativeVersionId: string;
  readonly renderPurpose: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

export interface ProjectRenderArtifactOutcome {
  readonly status?: unknown;
  readonly creativeVersionId?: unknown;
  readonly objectKey?: unknown;
  readonly checksumSha256?: unknown;
  readonly bytes?: unknown;
  readonly purpose?: unknown;
  readonly renderMode?: unknown;
  readonly renderer?: unknown;
}

export interface PersistedProjectRenderArtifact {
  readonly fileObject: FileObjectRecord;
  readonly render: CreativeRenderRecord;
}

export interface ProjectRenderArtifactPersistenceOptions {
  readonly beforeRenderInsert?: () => Promise<void> | void;
}

interface RenderRow {
  id: string;
  workspace_id: string;
  creative_version_id: string;
  async_job_id: string | null;
  render_purpose: string;
  file_object_id: string;
  status: CreativeRenderRecord["status"];
  render_config_json: Record<string, unknown>;
  created_at: Date;
}

const jsonBytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), "utf8");

function failure(code: string, message: string, retryable = false): Error {
  return Object.assign(new Error(message), { code, retryable });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function deterministicUuid(identity: string): string {
  if (isUuid(identity)) return identity;
  const bytes = createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 32).split("");
  bytes[12] = "4";
  bytes[16] = ["8", "9", "a", "b"][Number.parseInt(bytes[16]!, 16) % 4]!;
  return `${bytes.slice(0, 8).join("")}-${bytes.slice(8, 12).join("")}-${bytes.slice(12, 16).join("")}-${bytes.slice(16, 20).join("")}-${bytes.slice(20).join("")}`;
}

export function assertRendererArtifactObjectKey(workspaceId: string, objectKey: string): void {
  const prefix = `renders/${workspaceId}/`;
  if (
    !objectKey.startsWith(prefix) ||
    objectKey.includes("\\") ||
    objectKey.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:\/\//iu.test(objectKey) ||
    objectKey.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    objectKey.length > 1000
  )
    throw failure("PROJECT_RENDER_OBJECT_KEY_INVALID", "Renderer artifact object key is invalid");
}

function validateOutcome(
  context: ProjectRenderArtifactContext,
  outcome: ProjectRenderArtifactOutcome,
): {
  objectKey: string;
  checksumSha256: string;
  bytes: number;
  purpose: string;
  renderMode: string;
} {
  if (outcome.status !== "COMPLETED")
    throw failure("PROJECT_RENDER_OUTCOME_INCOMPLETE", "Renderer outcome is not completed");
  if (outcome.creativeVersionId !== context.creativeVersionId)
    throw failure(
      "PROJECT_RENDER_ARTIFACT_CONTEXT_MISMATCH",
      "Renderer outcome CreativeVersion does not match the active Project render context",
    );
  if (outcome.purpose !== context.renderPurpose)
    throw failure(
      "PROJECT_RENDER_ARTIFACT_CONTEXT_MISMATCH",
      "Renderer outcome purpose does not match the active Project render context",
    );
  const objectKey = typeof outcome.objectKey === "string" ? outcome.objectKey : "";
  const checksumSha256 =
    typeof outcome.checksumSha256 === "string" ? outcome.checksumSha256.toLowerCase() : "";
  const bytes = typeof outcome.bytes === "number" ? outcome.bytes : Number.NaN;
  const purpose = typeof outcome.purpose === "string" ? outcome.purpose : "";
  const renderMode = typeof outcome.renderMode === "string" ? outcome.renderMode : "";
  if (
    !objectKey ||
    !/^[0-9a-f]{64}$/iu.test(checksumSha256) ||
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    !purpose ||
    !renderMode
  )
    throw failure(
      "PROJECT_RENDER_OUTCOME_INVALID",
      "Renderer outcome is missing durable artifact fields",
    );
  assertRendererArtifactObjectKey(context.workspaceId, objectKey);
  return { objectKey, checksumSha256, bytes, purpose, renderMode };
}

function renderRecord(row: RenderRow): CreativeRenderRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    creativeVersionId: row.creative_version_id,
    asyncJobId: row.async_job_id,
    renderPurpose: row.render_purpose,
    fileObjectId: row.file_object_id,
    status: row.status,
    renderConfigJson: row.render_config_json,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Commits the ObjectStorage reference graph before a workflow item is allowed
 * to become COMPLETED. The object itself is written by the Frozen renderer;
 * this class owns only durable metadata and replay-safe identity.
 */
export class ProjectRenderArtifactPersistence {
  public constructor(
    private readonly sql: Sql,
    private readonly storage: ObjectStorage,
    private readonly options: ProjectRenderArtifactPersistenceOptions = {},
  ) {}

  public async persist(
    context: ProjectRenderArtifactContext,
    outcome: ProjectRenderArtifactOutcome,
  ): Promise<PersistedProjectRenderArtifact> {
    const validated = validateOutcome(context, outcome);
    let head;
    try {
      head = await this.storage.head(validated.objectKey);
    } catch (error) {
      throw Object.assign(
        failure(
          "PROJECT_RENDER_ARTIFACT_HEAD_FAILED",
          "Renderer artifact could not be verified in object storage",
          true,
        ),
        { cause: error },
      );
    }
    if (!head || head.objectKey !== validated.objectKey || head.bytes !== validated.bytes)
      throw failure(
        "PROJECT_RENDER_ARTIFACT_STORAGE_VERIFICATION_FAILED",
        "Renderer artifact object storage HEAD does not match the render outcome",
        true,
      );
    if (head.bucket.length === 0)
      throw failure(
        "PROJECT_RENDER_ARTIFACT_STORAGE_VERIFICATION_FAILED",
        "Renderer artifact object storage bucket is missing",
        true,
      );
    if (head.checksumSha256 && head.checksumSha256.toLowerCase() !== validated.checksumSha256)
      throw failure(
        "PROJECT_RENDER_ARTIFACT_CHECKSUM_MISMATCH",
        "Renderer artifact object storage checksum differs from the render outcome",
      );

    const renderId = deterministicUuid(context.messageId);
    const renderConfigJson = {
      objectKey: validated.objectKey,
      checksumSha256: validated.checksumSha256,
      bytes: validated.bytes,
      mimeType: context.mimeType,
      width: context.width,
      height: context.height,
      renderMode: validated.renderMode,
      ...(outcome.renderer && typeof outcome.renderer === "object"
        ? { renderer: outcome.renderer }
        : {}),
    } satisfies Record<string, unknown>;

    return this.sql.begin(async (transaction) => {
      const versions = await transaction<
        { id: string; campaign_id: string; project_id: string | null }[]
      >`SELECT cv.id, c.campaign_id, cs.project_id
        FROM creative_version cv
        JOIN creative c ON c.id = cv.creative_id
        JOIN creative_set cs ON cs.id = c.creative_set_id
        WHERE cv.id = ${context.creativeVersionId}
          AND cv.workspace_id = ${context.workspaceId}
          AND c.workspace_id = ${context.workspaceId}
          AND cs.workspace_id = ${context.workspaceId}`;
      if (
        versions.length !== 1 ||
        versions[0]!.campaign_id !== context.campaignId ||
        versions[0]!.project_id !== context.projectId
      )
        throw failure(
          "PROJECT_RENDER_ARTIFACT_CONTEXT_MISMATCH",
          "CreativeVersion is not owned by the active Project render graph",
        );

      const fileObject = await persistFileObject(transaction, {
        id: randomUUID(),
        workspaceId: context.workspaceId,
        storageProvider: "S3",
        bucket: head.bucket,
        objectKey: validated.objectKey,
        originalFilename: `renderer-${context.creativeVersionId}-${context.renderPurpose.toLowerCase()}.png`,
        mimeType: context.mimeType,
        bytes: validated.bytes,
        checksumSha256: validated.checksumSha256,
        width: context.width,
        height: context.height,
        metadataJson: {
          kind: "RENDERER_ARTIFACT",
          creativeVersionId: context.creativeVersionId,
          jobId: context.jobId,
          messageId: context.messageId,
          renderPurpose: context.renderPurpose,
          renderMode: validated.renderMode,
          width: context.width,
          height: context.height,
          ...(outcome.renderer && typeof outcome.renderer === "object"
            ? { renderer: outcome.renderer }
            : {}),
        },
        createdAt: new Date().toISOString(),
      });
      assertRendererArtifactObjectKey(context.workspaceId, fileObject.objectKey);
      if (
        fileObject.workspaceId !== context.workspaceId ||
        fileObject.bytes !== validated.bytes ||
        fileObject.checksumSha256.toLowerCase() !== validated.checksumSha256
      )
        throw failure(
          "PROJECT_RENDER_ARTIFACT_FILE_IDENTITY_MISMATCH",
          "Persisted FileObject does not match the Renderer artifact",
        );
      if (fileObject.objectKey !== validated.objectKey)
        throw failure(
          "PROJECT_RENDER_ARTIFACT_FILE_SCOPE_MISMATCH",
          "Content-deduplicated FileObject is not the Renderer artifact object",
        );

      await this.options.beforeRenderInsert?.();

      const inserted = await transaction<RenderRow[]>`
        INSERT INTO creative_render
          (id, workspace_id, creative_version_id, async_job_id, render_purpose, file_object_id,
           status, render_config_json)
        VALUES
          (${renderId}, ${context.workspaceId}, ${context.creativeVersionId}, ${context.jobId},
           ${context.renderPurpose}, ${fileObject.id}, 'COMPLETED',
           convert_from(${jsonBytes(renderConfigJson)}, 'UTF8')::jsonb)
        ON CONFLICT (id) DO NOTHING
        RETURNING id, workspace_id, creative_version_id, async_job_id, render_purpose,
          file_object_id, status, render_config_json, created_at`;
      const rows = inserted.length
        ? inserted
        : await transaction<RenderRow[]>`SELECT id, workspace_id, creative_version_id,
            async_job_id, render_purpose, file_object_id, status, render_config_json, created_at
          FROM creative_render WHERE id = ${renderId}`;
      const row = rows[0];
      if (
        !row ||
        row.workspace_id !== context.workspaceId ||
        row.creative_version_id !== context.creativeVersionId ||
        row.async_job_id !== context.jobId ||
        row.render_purpose !== context.renderPurpose ||
        row.file_object_id !== fileObject.id ||
        row.status !== "COMPLETED"
      )
        throw failure(
          "PROJECT_CREATIVE_RENDER_IDENTITY_MISMATCH",
          "Deterministic CreativeRender identity conflicts with the current render",
        );
      return { fileObject, render: renderRecord(row) };
    });
  }
}
