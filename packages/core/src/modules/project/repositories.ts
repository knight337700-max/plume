import { randomUUID } from "node:crypto";
import type { AssetRoleCode } from "./asset-role.js";

export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export interface ProjectRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status: ProjectStatus;
  readonly createdBy?: string | null;
  readonly archivedAt?: string | null;
  readonly revisionNo: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ProjectAssetReferenceRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly assetVersionId: string;
  readonly productId?: string | null;
  readonly roleCode: AssetRoleCode;
  readonly createdBy?: string | null;
  readonly createdAt: string;
}
export interface ProjectRepositories {
  listProjects(workspaceId: string, campaignId: string): Promise<readonly ProjectRecord[]>;
  getProject(workspaceId: string, id: string): Promise<ProjectRecord | null>;
  createProject(
    input: Omit<ProjectRecord, "id" | "status" | "revisionNo" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<ProjectRecord>;
  updateProject(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<ProjectRecord, "name" | "description">>,
    expectedRevision?: number,
  ): Promise<ProjectRecord>;
  archiveProject(
    workspaceId: string,
    id: string,
    expectedRevision?: number,
  ): Promise<ProjectRecord>;
  listAssetReferences(
    workspaceId: string,
    projectId: string,
  ): Promise<readonly ProjectAssetReferenceRecord[]>;
  addAssetReference(
    input: Omit<ProjectAssetReferenceRecord, "id" | "createdAt"> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<ProjectAssetReferenceRecord>;
  removeAssetReference(workspaceId: string, projectId: string, id: string): Promise<void>;
}
export interface ProjectSeed {
  readonly projects?: readonly ProjectRecord[];
  readonly assetReferences?: readonly ProjectAssetReferenceRecord[];
}
const nowIso = () => new Date().toISOString();
function error(code: string, message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { code, statusCode });
}

export function createInMemoryProjectRepositories(seed: ProjectSeed = {}): ProjectRepositories {
  const projects = new Map((seed.projects ?? []).map((item) => [item.id, item]));
  const refs = new Map((seed.assetReferences ?? []).map((item) => [item.id, item]));
  const owned = (workspaceId: string, id: string) => {
    const item = projects.get(id);
    if (!item || item.workspaceId !== workspaceId)
      throw error("RESOURCE_NOT_FOUND", "Project not found", 404);
    return item;
  };
  return {
    async listProjects(workspaceId, campaignId) {
      return [...projects.values()].filter(
        (p) =>
          p.workspaceId === workspaceId && p.campaignId === campaignId && p.status !== "ARCHIVED",
      );
    },
    async getProject(workspaceId, id) {
      const item = projects.get(id);
      return item?.workspaceId === workspaceId ? item : null;
    },
    async createProject(input) {
      const at = nowIso();
      const item = Object.freeze({
        ...input,
        id: input.id ?? randomUUID(),
        status: "ACTIVE" as const,
        archivedAt: null,
        revisionNo: 1,
        createdAt: at,
        updatedAt: at,
      });
      projects.set(item.id, item);
      return item;
    },
    async updateProject(workspaceId, id, patch, expectedRevision) {
      const current = owned(workspaceId, id);
      if (expectedRevision !== undefined && current.revisionNo !== expectedRevision)
        throw error("REVISION_MISMATCH", "Project revision has changed", 412);
      const item = Object.freeze({
        ...current,
        ...patch,
        revisionNo: current.revisionNo + 1,
        updatedAt: nowIso(),
      });
      projects.set(id, item);
      return item;
    },
    async archiveProject(workspaceId, id, expectedRevision) {
      const current = owned(workspaceId, id);
      if (expectedRevision !== undefined && current.revisionNo !== expectedRevision)
        throw error("REVISION_MISMATCH", "Project revision has changed", 412);
      const archivedAt = nowIso();
      const item = Object.freeze({
        ...current,
        status: "ARCHIVED" as const,
        archivedAt,
        revisionNo: current.revisionNo + 1,
        updatedAt: archivedAt,
      });
      projects.set(id, item);
      return item;
    },
    async listAssetReferences(workspaceId, projectId) {
      owned(workspaceId, projectId);
      return [...refs.values()].filter(
        (r) => r.workspaceId === workspaceId && r.projectId === projectId,
      );
    },
    async addAssetReference(input) {
      owned(input.workspaceId, input.projectId);
      const duplicate = [...refs.values()].find(
        (r) =>
          r.workspaceId === input.workspaceId &&
          r.projectId === input.projectId &&
          r.assetVersionId === input.assetVersionId &&
          (r.productId ?? null) === (input.productId ?? null),
      );
      if (duplicate) return duplicate;
      const item = Object.freeze({
        ...input,
        productId: input.productId ?? null,
        id: input.id ?? randomUUID(),
        createdAt: input.createdAt ?? nowIso(),
      });
      refs.set(item.id, item);
      return item;
    },
    async removeAssetReference(workspaceId, projectId, id) {
      owned(workspaceId, projectId);
      const item = refs.get(id);
      if (!item || item.workspaceId !== workspaceId || item.projectId !== projectId)
        throw error("RESOURCE_NOT_FOUND", "Project asset reference not found", 404);
      refs.delete(id);
    },
  };
}
