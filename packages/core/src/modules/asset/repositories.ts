import { randomUUID } from "node:crypto";

export type AssetStatus = "ACTIVE" | "ARCHIVED" | "PROCESSING" | "FAILED";
export type LicenseStatus = "VALID" | "EXPIRED" | "UNKNOWN" | "RESTRICTED";

export interface AssetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly brandId: string;
  readonly name: string;
  readonly assetType: string;
  readonly status: AssetStatus;
  readonly currentVersionId?: string;
  readonly licenseStatus: LicenseStatus;
  readonly licenseStartAt?: string;
  readonly licenseEndAt?: string;
  readonly analysisSummaryJson: Readonly<Record<string, unknown>>;
  readonly revisionNo: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssetVersionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly designAssetId: string;
  readonly versionNo: number;
  readonly fileObjectId: string;
  readonly sourceType: string;
  readonly analysisJson: Readonly<Record<string, unknown>>;
  readonly createdBy?: string;
  readonly createdAt: string;
}

export interface ProductAssetLinkRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly productId: string;
  readonly assetVersionId: string;
  readonly isPrimary: boolean;
  readonly sortOrder: number;
  readonly createdAt: string;
}

export interface AssetRepositories {
  listAssets(workspaceId: string, brandId: string, includeArchived?: boolean): Promise<readonly AssetRecord[]>;
  getAsset(workspaceId: string, id: string): Promise<AssetRecord | null>;
  createAsset(input: Omit<AssetRecord, "id" | "revisionNo" | "status" | "analysisSummaryJson" | "createdAt" | "updatedAt"> & { id?: string; status?: AssetStatus; analysisSummaryJson?: Readonly<Record<string, unknown>> }): Promise<AssetRecord>;
  updateAsset(workspaceId: string, id: string, patch: Partial<Pick<AssetRecord, "brandId" | "name" | "assetType" | "status" | "licenseStatus" | "licenseStartAt" | "licenseEndAt" | "analysisSummaryJson">>, expectedRevision?: number): Promise<AssetRecord>;
  archiveAsset(workspaceId: string, id: string, expectedRevision?: number): Promise<AssetRecord>;
  listVersions(workspaceId: string, assetId: string): Promise<readonly AssetVersionRecord[]>;
  getVersion(workspaceId: string, versionId: string): Promise<AssetVersionRecord | null>;
  createVersion(input: Omit<AssetVersionRecord, "id" | "versionNo" | "createdAt"> & { id?: string; versionNo?: number; createdAt?: string }): Promise<AssetVersionRecord>;
  listProductLinks(workspaceId: string, productId: string): Promise<readonly ProductAssetLinkRecord[]>;
  linkProduct(input: Omit<ProductAssetLinkRecord, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<ProductAssetLinkRecord>;
  unlinkProduct(workspaceId: string, productId: string, assetVersionId: string): Promise<void>;
}

export interface AssetSeed { readonly assets?: readonly AssetRecord[]; readonly versions?: readonly AssetVersionRecord[]; readonly links?: readonly ProductAssetLinkRecord[] }
function notFound(kind: string): Error { const error = new Error(`${kind} not found`); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }
function revisionMismatch(): Error { const error = new Error("Asset revision has changed"); Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 }); return error; }

export function createInMemoryAssetRepositories(seed: AssetSeed = {}): AssetRepositories {
  const assets = new Map((seed.assets ?? []).map((item) => [item.id, item]));
  const versions = new Map((seed.versions ?? []).map((item) => [item.id, item]));
  const links = new Map((seed.links ?? []).map((item) => [item.id, item]));
  const getOwnedAsset = (workspaceId: string, id: string): AssetRecord => { const item = assets.get(id); if (!item || item.workspaceId !== workspaceId) throw notFound("Asset"); return item; };
  const getOwnedVersion = (workspaceId: string, id: string): AssetVersionRecord => { const item = versions.get(id); if (!item || item.workspaceId !== workspaceId) throw notFound("Asset version"); return item; };
  return {
    async listAssets(workspaceId, brandId, includeArchived = false) { return [...assets.values()].filter((item) => item.workspaceId === workspaceId && item.brandId === brandId && (includeArchived || item.status !== "ARCHIVED")); },
    async getAsset(workspaceId, id) { const item = assets.get(id); return item?.workspaceId === workspaceId ? item : null; },
    async createAsset(input) { const createdAt = new Date().toISOString(); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, status: input.status ?? "ACTIVE" as const, analysisSummaryJson: input.analysisSummaryJson ?? {}, revisionNo: 1, createdAt, updatedAt: createdAt }); assets.set(item.id, item); return item; },
    async updateAsset(workspaceId, id, patch, expectedRevision) { const current = getOwnedAsset(workspaceId, id); if (expectedRevision !== undefined && current.revisionNo !== expectedRevision) throw revisionMismatch(); const next = Object.freeze({ ...current, ...patch, revisionNo: current.revisionNo + 1, updatedAt: new Date().toISOString() }); assets.set(id, next); return next; },
    async archiveAsset(workspaceId, id, expectedRevision) { return this.updateAsset(workspaceId, id, { status: "ARCHIVED" }, expectedRevision); },
    async listVersions(workspaceId, assetId) { getOwnedAsset(workspaceId, assetId); return [...versions.values()].filter((item) => item.workspaceId === workspaceId && item.designAssetId === assetId).sort((a, b) => a.versionNo - b.versionNo); },
    async getVersion(workspaceId, versionId) { const item = versions.get(versionId); return item?.workspaceId === workspaceId ? item : null; },
    async createVersion(input) { const asset = getOwnedAsset(input.workspaceId, input.designAssetId); const current = [...versions.values()].filter((item) => item.designAssetId === input.designAssetId).sort((a, b) => b.versionNo - a.versionNo)[0]; const versionNo = input.versionNo ?? (current?.versionNo ?? 0) + 1; if (current && versionNo <= current.versionNo) throw new Error("Asset versions are append-only"); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, versionNo, createdAt: input.createdAt ?? new Date().toISOString() }); versions.set(item.id, item); const nextAsset = Object.freeze({ ...asset, currentVersionId: item.id, revisionNo: asset.revisionNo + 1, updatedAt: new Date().toISOString() }); assets.set(asset.id, nextAsset); return item; },
    async listProductLinks(workspaceId, productId) { return [...links.values()].filter((item) => item.workspaceId === workspaceId && item.productId === productId); },
    async linkProduct(input) { getOwnedVersion(input.workspaceId, input.assetVersionId); const existing = [...links.values()].find((item) => item.workspaceId === input.workspaceId && item.productId === input.productId && item.assetVersionId === input.assetVersionId); if (existing) return existing; const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, createdAt: input.createdAt ?? new Date().toISOString() }); links.set(item.id, item); return item; },
    async unlinkProduct(workspaceId, productId, assetVersionId) { for (const [id, item] of links) if (item.workspaceId === workspaceId && item.productId === productId && item.assetVersionId === assetVersionId) links.delete(id); },
  };
}
