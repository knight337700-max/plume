import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import type {
  ProjectAssetReferenceRecord,
  ProjectRecord,
  ProjectRepositories,
  ProjectStatus,
} from "../../../core/src/modules/project/repositories.js";

interface ProjectRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_by: string | null;
  archived_at: Date | null;
  revision_no: number;
  created_at: Date;
  updated_at: Date;
}
interface ProjectAssetReferenceRow {
  id: string;
  workspace_id: string;
  project_id: string;
  asset_version_id: string;
  product_id: string | null;
  role_code: ProjectAssetReferenceRecord["roleCode"];
  created_by: string | null;
  created_at: Date;
}
const iso = (value: Date) => value.toISOString();
const project = (row: ProjectRow): ProjectRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  campaignId: row.campaign_id,
  name: row.name,
  description: row.description,
  status: row.status,
  createdBy: row.created_by,
  archivedAt: row.archived_at ? iso(row.archived_at) : null,
  revisionNo: row.revision_no,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});
const reference = (row: ProjectAssetReferenceRow): ProjectAssetReferenceRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  projectId: row.project_id,
  assetVersionId: row.asset_version_id,
  productId: row.product_id,
  roleCode: row.role_code,
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
});
const failure = (code: string, message: string, statusCode: number) =>
  Object.assign(new Error(message), { code, statusCode });

/** PostgreSQL authority for the Project aggregate and Project asset links. */
export class DrizzleProjectRepositories implements ProjectRepositories {
  constructor(private readonly sql: Sql) {}
  async listProjects(workspaceId: string, campaignId: string) {
    const rows = await this.sql<
      ProjectRow[]
    >`SELECT id, workspace_id, campaign_id, name, description, status, created_by, archived_at, revision_no, created_at, updated_at FROM project WHERE workspace_id = ${workspaceId} AND campaign_id = ${campaignId} AND status <> 'ARCHIVED' AND deleted_at IS NULL ORDER BY created_at, id`;
    return rows.map(project);
  }
  async getProject(workspaceId: string, id: string) {
    const rows = await this.sql<
      ProjectRow[]
    >`SELECT id, workspace_id, campaign_id, name, description, status, created_by, archived_at, revision_no, created_at, updated_at FROM project WHERE id = ${id} AND workspace_id = ${workspaceId} AND deleted_at IS NULL`;
    return rows[0] ? project(rows[0]) : null;
  }
  async createProject(input: Parameters<ProjectRepositories["createProject"]>[0]) {
    const rows = await this.sql<
      ProjectRow[]
    >`INSERT INTO project (id, workspace_id, campaign_id, name, description, created_by) VALUES (${input.id ?? randomUUID()}, ${input.workspaceId}, ${input.campaignId}, ${input.name}, ${input.description ?? null}, ${input.createdBy ?? null}) RETURNING id, workspace_id, campaign_id, name, description, status, created_by, archived_at, revision_no, created_at, updated_at`;
    if (!rows[0]) throw failure("PROJECT_CREATE_FAILED", "Project creation failed", 500);
    return project(rows[0]);
  }
  async updateProject(
    workspaceId: string,
    id: string,
    patch: Parameters<ProjectRepositories["updateProject"]>[2],
    expectedRevision?: number,
  ) {
    const rows = await this.sql<
      ProjectRow[]
    >`UPDATE project SET name = COALESCE(${patch.name ?? null}, name), description = COALESCE(${patch.description ?? null}, description), revision_no = revision_no + 1, updated_at = now() WHERE id = ${id} AND workspace_id = ${workspaceId} AND status <> 'ARCHIVED' AND deleted_at IS NULL AND (${expectedRevision ?? null}::integer IS NULL OR revision_no = ${expectedRevision ?? null}) RETURNING id, workspace_id, campaign_id, name, description, status, created_by, archived_at, revision_no, created_at, updated_at`;
    if (rows[0]) return project(rows[0]);
    if (
      expectedRevision !== undefined &&
      (await this.getProject(workspaceId, id))?.status !== "ARCHIVED"
    )
      throw failure("REVISION_MISMATCH", "Project revision has changed", 412);
    throw failure("RESOURCE_NOT_FOUND", "Project not found", 404);
  }
  async archiveProject(workspaceId: string, id: string, expectedRevision?: number) {
    const rows = await this.sql<
      ProjectRow[]
    >`UPDATE project SET status = 'ARCHIVED', archived_at = now(), revision_no = revision_no + 1, updated_at = now() WHERE id = ${id} AND workspace_id = ${workspaceId} AND status <> 'ARCHIVED' AND deleted_at IS NULL AND (${expectedRevision ?? null}::integer IS NULL OR revision_no = ${expectedRevision ?? null}) RETURNING id, workspace_id, campaign_id, name, description, status, created_by, archived_at, revision_no, created_at, updated_at`;
    if (rows[0]) return project(rows[0]);
    if (
      expectedRevision !== undefined &&
      (await this.getProject(workspaceId, id))?.status !== "ARCHIVED"
    )
      throw failure("REVISION_MISMATCH", "Project revision has changed", 412);
    throw failure("RESOURCE_NOT_FOUND", "Project not found", 404);
  }
  async listAssetReferences(workspaceId: string, projectId: string) {
    if (!(await this.getProject(workspaceId, projectId)))
      throw failure("RESOURCE_NOT_FOUND", "Project not found", 404);
    const rows = await this.sql<
      ProjectAssetReferenceRow[]
    >`SELECT id, workspace_id, project_id, asset_version_id, product_id, role_code, created_by, created_at FROM project_asset_reference WHERE workspace_id = ${workspaceId} AND project_id = ${projectId} ORDER BY created_at, id`;
    return rows.map(reference);
  }
  async addAssetReference(input: Parameters<ProjectRepositories["addAssetReference"]>[0]) {
    if (!(await this.getProject(input.workspaceId, input.projectId)))
      throw failure("RESOURCE_NOT_FOUND", "Project not found", 404);
    const rows = await this.sql<
      ProjectAssetReferenceRow[]
    >`INSERT INTO project_asset_reference (id, workspace_id, project_id, asset_version_id, product_id, role_code, created_by) VALUES (${input.id ?? randomUUID()}, ${input.workspaceId}, ${input.projectId}, ${input.assetVersionId}, ${input.productId ?? null}, ${input.roleCode}, ${input.createdBy ?? null}) ON CONFLICT (project_id, asset_version_id, product_id) DO UPDATE SET project_id = project_asset_reference.project_id RETURNING id, workspace_id, project_id, asset_version_id, product_id, role_code, created_by, created_at`;
    if (!rows[0])
      throw failure(
        "PROJECT_ASSET_REFERENCE_CREATE_FAILED",
        "Project asset reference creation failed",
        500,
      );
    return reference(rows[0]);
  }
  async removeAssetReference(workspaceId: string, projectId: string, id: string) {
    const rows = await this.sql<
      { id: string }[]
    >`DELETE FROM project_asset_reference WHERE id = ${id} AND workspace_id = ${workspaceId} AND project_id = ${projectId} RETURNING id`;
    if (!rows[0]) throw failure("RESOURCE_NOT_FOUND", "Project asset reference not found", 404);
  }
}
