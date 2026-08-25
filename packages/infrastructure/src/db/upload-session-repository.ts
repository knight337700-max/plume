import type { Sql } from "postgres";
import type {
  SessionRecord,
  SessionStore,
} from "../../../core/src/modules/iam/session-use-cases.js";
import type {
  FileObjectRecord,
  UploadSessionRecord,
  UploadSessionRepository,
} from "../../../core/src/modules/asset/upload-session.js";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapSession(row: Record<string, unknown>): UploadSessionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    status: String(row.status) as UploadSessionRecord["status"],
    mode: String(row.mode) as UploadSessionRecord["mode"],
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    bytes: Number(row.bytes),
    ...(row.checksum_sha256 ? { checksumSha256: String(row.checksum_sha256) } : {}),
    purpose: String(row.purpose) as UploadSessionRecord["purpose"],
    objectKey: String(row.object_key),
    bucket: String(row.bucket),
    expiresAt: iso(row.expires_at),
    parts: Array.isArray(row.parts_json) ? (row.parts_json as UploadSessionRecord["parts"]) : [],
    ...(row.file_object_id ? { fileObjectId: String(row.file_object_id) } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapFile(row: Record<string, unknown>): FileObjectRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    storageProvider: String(row.storage_provider),
    bucket: String(row.bucket),
    objectKey: String(row.object_key),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    bytes: Number(row.bytes),
    checksumSha256: String(row.checksum_sha256),
    metadataJson: (row.metadata_json ?? {}) as Readonly<Record<string, unknown>>,
    createdAt: iso(row.created_at),
  };
}

export class PostgresUploadSessionRepository implements UploadSessionRepository {
  public constructor(private readonly sql: Sql) {}

  async create(session: UploadSessionRecord): Promise<UploadSessionRecord> {
    const rows = await this.sql<Record<string, unknown>[]>`
      INSERT INTO upload_session
        (id, workspace_id, status, mode, filename, mime_type, bytes, checksum_sha256, purpose,
         object_key, bucket, expires_at, parts_json, file_object_id, created_at, updated_at)
      VALUES
        (${session.id}, ${session.workspaceId}, ${session.status}, ${session.mode}, ${session.filename},
         ${session.mimeType}, ${session.bytes}, ${session.checksumSha256 ?? null}, ${session.purpose},
        ${session.objectKey}, ${session.bucket}, ${session.expiresAt}, ${this.sql.json(JSON.parse(JSON.stringify(session.parts)))},
         ${session.fileObjectId ?? null}, ${session.createdAt}, ${session.updatedAt})
      RETURNING *
    `;
    if (!rows[0]) throw new Error("UPLOAD_SESSION_CREATE_FAILED");
    return mapSession(rows[0]);
  }

  async get(workspaceId: string, id: string): Promise<UploadSessionRecord | null> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM upload_session WHERE id = ${id} AND workspace_id = ${workspaceId}
    `;
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async update(id: string, patch: Partial<UploadSessionRecord>): Promise<UploadSessionRecord> {
    const rows = await this.sql<Record<string, unknown>[]>`
      UPDATE upload_session
      SET status = COALESCE(${patch.status ?? null}, status),
          parts_json = COALESCE(${patch.parts === undefined ? null : this.sql.json(JSON.parse(JSON.stringify(patch.parts)))}, parts_json),
          file_object_id = COALESCE(${patch.fileObjectId ?? null}, file_object_id),
          updated_at = COALESCE(${patch.updatedAt ?? null}, now())
      WHERE id = ${id}
      RETURNING *
    `;
    if (!rows[0])
      throw Object.assign(new Error("UPLOAD_NOT_FOUND"), {
        code: "UPLOAD_NOT_FOUND",
        statusCode: 404,
      });
    return mapSession(rows[0]);
  }

  async createFileObject(fileObject: FileObjectRecord): Promise<FileObjectRecord> {
    const inserted = await this.sql<Record<string, unknown>[]>`
      INSERT INTO file_object
        (id, workspace_id, storage_provider, bucket, object_key, original_filename, mime_type,
         bytes, checksum_sha256, metadata_json, created_at)
      VALUES
        (${fileObject.id}, ${fileObject.workspaceId}, ${fileObject.storageProvider}, ${fileObject.bucket},
         ${fileObject.objectKey}, ${fileObject.originalFilename}, ${fileObject.mimeType}, ${fileObject.bytes},
         ${fileObject.checksumSha256}, ${this.sql.json(JSON.parse(JSON.stringify(fileObject.metadataJson)))}, ${fileObject.createdAt})
      ON CONFLICT (workspace_id, checksum_sha256, bytes) DO NOTHING
      RETURNING *
    `;
    if (inserted[0]) return mapFile(inserted[0]);
    const existing = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM file_object
      WHERE workspace_id = ${fileObject.workspaceId}
        AND checksum_sha256 = ${fileObject.checksumSha256}
        AND bytes = ${fileObject.bytes}
      LIMIT 1
    `;
    if (!existing[0]) throw new Error("FILE_OBJECT_CREATE_FAILED");
    return mapFile(existing[0]);
  }

  async getFileObject(workspaceId: string, id: string): Promise<FileObjectRecord | null> {
    const rows = await this.sql<Record<string, unknown>[]>`
      SELECT * FROM file_object WHERE id = ${id} AND workspace_id = ${workspaceId}
    `;
    return rows[0] ? mapFile(rows[0]) : null;
  }
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

function mapIdentitySession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at) } : {}),
  };
}

export class PostgresSessionStore implements SessionStore {
  public constructor(private readonly sql: Sql) {}

  async get(sessionId: string): Promise<SessionRecord | null> {
    const rows = await this.sql<SessionRow[]>`SELECT * FROM session_record WHERE id = ${sessionId}`;
    return rows[0] ? mapIdentitySession(rows[0]) : null;
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    await this
      .sql`UPDATE session_record SET revoked_at = ${revokedAt} WHERE id = ${sessionId} AND revoked_at IS NULL`;
  }
}
