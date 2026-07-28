import { randomUUID } from "node:crypto";
import { parseCreativeDocument, type CreativeDocument } from "./creative-document.js";

export type CreativeSetStatus =
  | "DRAFT"
  | "GENERATING"
  | "GENERATED"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "EXPORTED"
  | "ARCHIVED";
export type CreativeStatus =
  | "DRAFT"
  | "GENERATING"
  | "GENERATED"
  | "REVISION_REQUIRED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "EXPORTED"
  | "ARCHIVED";
export type CreativeVersionStatus =
  | "DRAFT"
  | "VALIDATING"
  | "REVISION_REQUIRED"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "EXPORTED"
  | "SUPERSEDED";
export type CreativeRenderStatus = "COMPLETED" | "FAILED";

export interface CreativeSetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly name: string;
  readonly generationRequestId?: string | null;
  readonly status: CreativeSetStatus;
  readonly revisionNo: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
}

export interface CreativeRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeSetId: string;
  readonly campaignId: string;
  readonly productId?: string | null;
  readonly campaignFormatSelectionId: string;
  readonly currentVersionId?: string | null;
  readonly status: CreativeStatus;
  readonly revisionNo: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string | null;
}

export interface CreativeVersionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeId: string;
  readonly versionNo: number;
  readonly parentVersionId?: string | null;
  readonly formatProfileId: string;
  readonly layoutTemplateId?: string | null;
  readonly briefVersionId: string;
  readonly documentJson: CreativeDocument;
  readonly copyAssetsJson: Readonly<Record<string, unknown>>;
  readonly generationMetadataJson: Readonly<Record<string, unknown>>;
  readonly status: CreativeVersionStatus;
  readonly revisionNo: number;
  readonly createdBy?: string | null;
  readonly createdAt: string;
  readonly frozenAt?: string | null;
}

export interface CreativeAssetUsageRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly assetVersionId: string;
  readonly elementId?: string | null;
  readonly usageType: string;
  readonly transformJson: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CreativeEditOperationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly operationNo: number;
  readonly source: string;
  readonly commandText?: string | null;
  readonly operationJson: Readonly<Record<string, unknown>>;
  readonly appliedBy?: string | null;
  readonly createdAt: string;
}

export interface CreativeRenderRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly asyncJobId?: string | null;
  readonly renderPurpose: string;
  readonly fileObjectId: string;
  readonly status: CreativeRenderStatus;
  readonly renderConfigJson: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CreativeRepositories {
  listCreativeSets(workspaceId: string, campaignId?: string): Promise<readonly CreativeSetRecord[]>;
  getCreativeSet(workspaceId: string, id: string): Promise<CreativeSetRecord | null>;
  createCreativeSet(
    input: Omit<CreativeSetRecord, "id" | "status" | "revisionNo" | "createdAt" | "updatedAt"> & {
      id?: string;
      status?: CreativeSetStatus;
    },
  ): Promise<CreativeSetRecord>;
  updateCreativeSet(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<CreativeSetRecord, "name" | "status" | "generationRequestId">>,
    expectedRevision?: number,
  ): Promise<CreativeSetRecord>;
  archiveCreativeSet(
    workspaceId: string,
    id: string,
    expectedRevision?: number,
  ): Promise<CreativeSetRecord>;
  listCreatives(workspaceId: string, creativeSetId?: string): Promise<readonly CreativeRecord[]>;
  getCreative(workspaceId: string, id: string): Promise<CreativeRecord | null>;
  createCreative(
    input: Omit<CreativeRecord, "id" | "status" | "revisionNo" | "createdAt" | "updatedAt"> & {
      id?: string;
      status?: CreativeStatus;
    },
  ): Promise<CreativeRecord>;
  updateCreative(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<CreativeRecord, "status" | "currentVersionId" | "productId">>,
    expectedRevision?: number,
  ): Promise<CreativeRecord>;
  createVersion(
    input: Omit<
      CreativeVersionRecord,
      | "id"
      | "versionNo"
      | "status"
      | "revisionNo"
      | "createdAt"
      | "frozenAt"
      | "copyAssetsJson"
      | "generationMetadataJson"
    > & {
      id?: string;
      versionNo?: number;
      status?: CreativeVersionStatus;
      revisionNo?: number;
      createdAt?: string;
      copyAssetsJson?: Readonly<Record<string, unknown>>;
      generationMetadataJson?: Readonly<Record<string, unknown>>;
    },
  ): Promise<CreativeVersionRecord>;
  listVersions(workspaceId: string, creativeId: string): Promise<readonly CreativeVersionRecord[]>;
  getVersion(workspaceId: string, versionId: string): Promise<CreativeVersionRecord | null>;
  updateDraftVersion(
    workspaceId: string,
    versionId: string,
    patch: Pick<CreativeVersionRecord, "documentJson"> &
      Partial<Pick<CreativeVersionRecord, "copyAssetsJson" | "generationMetadataJson">>,
    expectedRevision?: number,
  ): Promise<CreativeVersionRecord>;
  freezeVersion(
    workspaceId: string,
    versionId: string,
    status?: Exclude<CreativeVersionStatus, "DRAFT" | "SUPERSEDED">,
  ): Promise<CreativeVersionRecord>;
  addAssetUsages(
    items: readonly (Omit<CreativeAssetUsageRecord, "id" | "createdAt"> & {
      id?: string;
      createdAt?: string;
    })[],
  ): Promise<readonly CreativeAssetUsageRecord[]>;
  listAssetUsages(
    workspaceId: string,
    versionId: string,
  ): Promise<readonly CreativeAssetUsageRecord[]>;
  appendEditOperations(
    items: readonly (Omit<CreativeEditOperationRecord, "id" | "operationNo" | "createdAt"> & {
      id?: string;
      operationNo?: number;
      createdAt?: string;
    })[],
  ): Promise<readonly CreativeEditOperationRecord[]>;
  listEditOperations(
    workspaceId: string,
    versionId: string,
  ): Promise<readonly CreativeEditOperationRecord[]>;
  createRender(
    input: Omit<CreativeRenderRecord, "id" | "status" | "createdAt"> & {
      id?: string;
      status?: CreativeRenderStatus;
      createdAt?: string;
    },
  ): Promise<CreativeRenderRecord>;
  listRenders(workspaceId: string, versionId: string): Promise<readonly CreativeRenderRecord[]>;
}

export interface CreativeSeed {
  readonly creativeSets?: readonly CreativeSetRecord[];
  readonly creatives?: readonly CreativeRecord[];
  readonly versions?: readonly CreativeVersionRecord[];
  readonly assetUsages?: readonly CreativeAssetUsageRecord[];
  readonly editOperations?: readonly CreativeEditOperationRecord[];
  readonly renders?: readonly CreativeRenderRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}
function notFound(kind: string): Error {
  const error = new Error(`${kind} not found`);
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}
function revisionMismatch(kind: string): Error {
  const error = new Error(`${kind} revision has changed`);
  Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 });
  return error;
}
function immutable(kind: string): Error {
  const error = new Error(`${kind} is immutable after freeze`);
  Object.assign(error, { code: "IMMUTABLE_VERSION", statusCode: 409 });
  return error;
}

export function createInMemoryCreativeRepositories(seed: CreativeSeed = {}): CreativeRepositories {
  const sets = new Map((seed.creativeSets ?? []).map((item) => [item.id, item]));
  const creatives = new Map((seed.creatives ?? []).map((item) => [item.id, item]));
  const versions = new Map((seed.versions ?? []).map((item) => [item.id, item]));
  const usages = new Map((seed.assetUsages ?? []).map((item) => [item.id, item]));
  const operations = new Map((seed.editOperations ?? []).map((item) => [item.id, item]));
  const renders = new Map((seed.renders ?? []).map((item) => [item.id, item]));
  const ownedSet = (workspaceId: string, id: string): CreativeSetRecord => {
    const item = sets.get(id);
    if (!item || item.workspaceId !== workspaceId || item.deletedAt) throw notFound("Creative set");
    return item;
  };
  const ownedCreative = (workspaceId: string, id: string): CreativeRecord => {
    const item = creatives.get(id);
    if (!item || item.workspaceId !== workspaceId || item.deletedAt) throw notFound("Creative");
    return item;
  };
  const ownedVersion = (workspaceId: string, id: string): CreativeVersionRecord => {
    const item = versions.get(id);
    if (!item || item.workspaceId !== workspaceId) throw notFound("Creative version");
    return item;
  };
  const assertVersionOwnedByCreative = (
    version: CreativeVersionRecord,
    creativeId: string,
  ): void => {
    if (version.creativeId !== creativeId)
      throw new Error("Creative version belongs to another creative");
  };
  return {
    async listCreativeSets(workspaceId, campaignId) {
      return [...sets.values()].filter(
        (item) =>
          item.workspaceId === workspaceId &&
          !item.deletedAt &&
          (!campaignId || item.campaignId === campaignId),
      );
    },
    async getCreativeSet(workspaceId, id) {
      const item = sets.get(id);
      return item?.workspaceId === workspaceId && !item.deletedAt ? item : null;
    },
    async createCreativeSet(input) {
      const createdAt = nowIso();
      const item = Object.freeze({
        id: input.id ?? randomUUID(),
        ...input,
        status: input.status ?? "DRAFT",
        revisionNo: 1,
        createdAt,
        updatedAt: createdAt,
      });
      sets.set(item.id, item);
      return item;
    },
    async updateCreativeSet(workspaceId, id, patch, expectedRevision) {
      const current = ownedSet(workspaceId, id);
      if (expectedRevision !== undefined && current.revisionNo !== expectedRevision)
        throw revisionMismatch("Creative set");
      const item = Object.freeze({
        ...current,
        ...patch,
        revisionNo: current.revisionNo + 1,
        updatedAt: nowIso(),
      });
      sets.set(id, item);
      return item;
    },
    async archiveCreativeSet(workspaceId, id, expectedRevision) {
      const item = await this.updateCreativeSet(
        workspaceId,
        id,
        { status: "ARCHIVED" },
        expectedRevision,
      );
      const archived = Object.freeze({ ...item, deletedAt: nowIso() });
      sets.set(id, archived);
      return archived;
    },
    async listCreatives(workspaceId, creativeSetId) {
      return [...creatives.values()].filter(
        (item) =>
          item.workspaceId === workspaceId &&
          !item.deletedAt &&
          (!creativeSetId || item.creativeSetId === creativeSetId),
      );
    },
    async getCreative(workspaceId, id) {
      const item = creatives.get(id);
      return item?.workspaceId === workspaceId && !item.deletedAt ? item : null;
    },
    async createCreative(input) {
      const set = ownedSet(input.workspaceId, input.creativeSetId);
      if (set.campaignId !== input.campaignId)
        throw new Error("Creative campaign does not match creative set");
      const createdAt = nowIso();
      const item = Object.freeze({
        id: input.id ?? randomUUID(),
        ...input,
        status: input.status ?? "DRAFT",
        revisionNo: 1,
        createdAt,
        updatedAt: createdAt,
      });
      creatives.set(item.id, item);
      return item;
    },
    async updateCreative(workspaceId, id, patch, expectedRevision) {
      const current = ownedCreative(workspaceId, id);
      if (expectedRevision !== undefined && current.revisionNo !== expectedRevision)
        throw revisionMismatch("Creative");
      if (patch.currentVersionId) ownedVersion(workspaceId, patch.currentVersionId);
      const item = Object.freeze({
        ...current,
        ...patch,
        revisionNo: current.revisionNo + 1,
        updatedAt: nowIso(),
      });
      creatives.set(id, item);
      return item;
    },
    async createVersion(input) {
      const creative = ownedCreative(input.workspaceId, input.creativeId);
      if (input.parentVersionId) {
        const parent = ownedVersion(input.workspaceId, input.parentVersionId);
        assertVersionOwnedByCreative(parent, input.creativeId);
      }
      const current = [...versions.values()]
        .filter((item) => item.creativeId === input.creativeId)
        .sort((a, b) => b.versionNo - a.versionNo)[0];
      const versionNo = input.versionNo ?? (current?.versionNo ?? 0) + 1;
      if (current && versionNo <= current.versionNo)
        throw new Error("Creative versions are append-only");
      const documentJson = parseCreativeDocument(input.documentJson);
      const createdAt = input.createdAt ?? nowIso();
      const item = Object.freeze({
        id: input.id ?? randomUUID(),
        ...input,
        versionNo,
        documentJson,
        copyAssetsJson: input.copyAssetsJson ?? {},
        generationMetadataJson: input.generationMetadataJson ?? {},
        status: input.status ?? "DRAFT",
        revisionNo: input.revisionNo ?? 1,
        createdAt,
        frozenAt: null,
      });
      versions.set(item.id, item);
      creatives.set(
        creative.id,
        Object.freeze({
          ...creative,
          currentVersionId: item.id,
          revisionNo: creative.revisionNo + 1,
          updatedAt: nowIso(),
        }),
      );
      return item;
    },
    async listVersions(workspaceId, creativeId) {
      ownedCreative(workspaceId, creativeId);
      return [...versions.values()]
        .filter((item) => item.workspaceId === workspaceId && item.creativeId === creativeId)
        .sort((a, b) => a.versionNo - b.versionNo);
    },
    async getVersion(workspaceId, versionId) {
      const item = versions.get(versionId);
      return item?.workspaceId === workspaceId ? item : null;
    },
    async updateDraftVersion(workspaceId, versionId, patch, expectedRevision) {
      const current = ownedVersion(workspaceId, versionId);
      if (current.status !== "DRAFT" || current.frozenAt) throw immutable("Creative version");
      if (expectedRevision !== undefined && current.revisionNo !== expectedRevision)
        throw revisionMismatch("Creative version");
      const documentJson = parseCreativeDocument(patch.documentJson);
      const item = Object.freeze({
        ...current,
        ...patch,
        documentJson,
        revisionNo: current.revisionNo + 1,
      });
      versions.set(versionId, item);
      return item;
    },
    async freezeVersion(workspaceId, versionId, status = "READY_FOR_APPROVAL") {
      const current = ownedVersion(workspaceId, versionId);
      if (current.status !== "DRAFT" || current.frozenAt) return current;
      const item = Object.freeze({ ...current, status, frozenAt: nowIso() });
      versions.set(versionId, item);
      return item;
    },
    async addAssetUsages(items) {
      const created: CreativeAssetUsageRecord[] = [];
      for (const input of items) {
        const version = ownedVersion(input.workspaceId, input.creativeVersionId);
        const duplicate = [...usages.values()].find(
          (item) =>
            item.creativeVersionId === version.id &&
            item.assetVersionId === input.assetVersionId &&
            item.elementId === (input.elementId ?? null),
        );
        if (duplicate) {
          created.push(duplicate);
          continue;
        }
        const item = Object.freeze({
          id: input.id ?? randomUUID(),
          ...input,
          elementId: input.elementId ?? null,
          transformJson: input.transformJson ?? {},
          createdAt: input.createdAt ?? nowIso(),
        });
        usages.set(item.id, item);
        created.push(item);
      }
      return created;
    },
    async listAssetUsages(workspaceId, versionId) {
      ownedVersion(workspaceId, versionId);
      return [...usages.values()].filter(
        (item) => item.workspaceId === workspaceId && item.creativeVersionId === versionId,
      );
    },
    async appendEditOperations(items) {
      const created: CreativeEditOperationRecord[] = [];
      for (const input of items) {
        const version = ownedVersion(input.workspaceId, input.creativeVersionId);
        const currentNo = Math.max(
          0,
          ...[...operations.values()]
            .filter((item) => item.creativeVersionId === version.id)
            .map((item) => item.operationNo),
        );
        const operationNo = input.operationNo ?? currentNo + 1;
        if (
          [...operations.values()].some(
            (item) => item.creativeVersionId === version.id && item.operationNo === operationNo,
          )
        )
          throw new Error("Creative edit operation number already exists");
        const item = Object.freeze({
          id: input.id ?? randomUUID(),
          ...input,
          operationNo,
          createdAt: input.createdAt ?? nowIso(),
        });
        operations.set(item.id, item);
        created.push(item);
      }
      return created;
    },
    async listEditOperations(workspaceId, versionId) {
      ownedVersion(workspaceId, versionId);
      return [...operations.values()]
        .filter((item) => item.workspaceId === workspaceId && item.creativeVersionId === versionId)
        .sort((a, b) => a.operationNo - b.operationNo);
    },
    async createRender(input) {
      const version = ownedVersion(input.workspaceId, input.creativeVersionId);
      if (version.workspaceId !== input.workspaceId) throw notFound("Creative version");
      const item = Object.freeze({
        id: input.id ?? randomUUID(),
        ...input,
        status: input.status ?? "COMPLETED",
        renderConfigJson: input.renderConfigJson ?? {},
        createdAt: input.createdAt ?? nowIso(),
      });
      renders.set(item.id, item);
      return item;
    },
    async listRenders(workspaceId, versionId) {
      ownedVersion(workspaceId, versionId);
      return [...renders.values()]
        .filter((item) => item.workspaceId === workspaceId && item.creativeVersionId === versionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
