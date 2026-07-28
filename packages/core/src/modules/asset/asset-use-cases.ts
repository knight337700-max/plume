import type { AssetRecord, AssetRepositories, AssetVersionRecord, ProductAssetLinkRecord } from "./repositories.js";

export interface CreateAssetInput { readonly workspaceId: string; readonly brandId: string; readonly name: string; readonly assetType: string; readonly licenseStatus?: AssetRecord["licenseStatus"]; readonly licenseStartAt?: string; readonly licenseEndAt?: string; readonly analysisSummaryJson?: Readonly<Record<string, unknown>> }
export interface CreateVersionInput { readonly workspaceId: string; readonly assetId: string; readonly fileObjectId: string; readonly sourceType: string; readonly analysisJson?: Readonly<Record<string, unknown>>; readonly createdBy?: string }
export interface AssetUseCases {
  list(workspaceId: string, brandId: string, includeArchived?: boolean): Promise<readonly AssetRecord[]>;
  get(workspaceId: string, assetId: string): Promise<AssetRecord | null>;
  create(input: CreateAssetInput): Promise<AssetRecord>;
  update(workspaceId: string, assetId: string, patch: Partial<Pick<AssetRecord, "brandId" | "name" | "assetType" | "licenseStatus" | "licenseStartAt" | "licenseEndAt" | "analysisSummaryJson">>, expectedRevision?: number): Promise<AssetRecord>;
  archive(workspaceId: string, assetId: string, expectedRevision?: number): Promise<AssetRecord>;
  listVersions(workspaceId: string, assetId: string): Promise<readonly AssetVersionRecord[]>;
  getVersion(workspaceId: string, versionId: string): Promise<AssetVersionRecord | null>;
  createVersion(input: CreateVersionInput): Promise<AssetVersionRecord>;
  listProductLinks(workspaceId: string, productId: string): Promise<readonly ProductAssetLinkRecord[]>;
  linkProduct(input: Omit<ProductAssetLinkRecord, "id" | "createdAt">): Promise<ProductAssetLinkRecord>;
  unlinkProduct(workspaceId: string, productId: string, assetVersionId: string): Promise<void>;
}

export function createAssetUseCases(repositories: AssetRepositories): AssetUseCases {
  return {
    list: (workspaceId, brandId, includeArchived) => repositories.listAssets(workspaceId, brandId, includeArchived),
    get: (workspaceId, assetId) => repositories.getAsset(workspaceId, assetId),
    create: (input) => repositories.createAsset({ ...input, licenseStatus: input.licenseStatus ?? "UNKNOWN" }),
    update: (workspaceId, assetId, patch, expectedRevision) => repositories.updateAsset(workspaceId, assetId, patch, expectedRevision),
    archive: (workspaceId, assetId, expectedRevision) => repositories.archiveAsset(workspaceId, assetId, expectedRevision),
    listVersions: (workspaceId, assetId) => repositories.listVersions(workspaceId, assetId),
    getVersion: (workspaceId, versionId) => repositories.getVersion(workspaceId, versionId),
    createVersion: (input) => repositories.createVersion({ workspaceId: input.workspaceId, designAssetId: input.assetId, fileObjectId: input.fileObjectId, sourceType: input.sourceType, analysisJson: input.analysisJson ?? {}, ...(input.createdBy ? { createdBy: input.createdBy } : {}) }),
    listProductLinks: (workspaceId, productId) => repositories.listProductLinks(workspaceId, productId),
    linkProduct: (input) => repositories.linkProduct(input),
    unlinkProduct: (workspaceId, productId, assetVersionId) => repositories.unlinkProduct(workspaceId, productId, assetVersionId),
  };
}
