import type { BrandProfileRecord, BrandRecord, ClientBrandRepositories } from "./repositories.js";

export interface BrandUseCases {
  get(workspaceId: string, id: string): Promise<BrandRecord | null>;
  list(workspaceId: string, advertiserId: string, includeArchived?: boolean): Promise<readonly BrandRecord[]>;
  create(workspaceId: string, advertiserId: string, input: { readonly name: string; readonly logoAssetId?: string }): Promise<BrandRecord>;
  update(workspaceId: string, id: string, patch: Partial<Pick<BrandRecord, "name" | "logoAssetId">>, expectedRevision?: number): Promise<BrandRecord>;
  archive(workspaceId: string, id: string, expectedRevision?: number): Promise<BrandRecord>;
  getProfile(workspaceId: string, brandId: string): Promise<BrandProfileRecord | null>;
  updateProfile(workspaceId: string, brandId: string, input: Omit<BrandProfileRecord, "id" | "workspaceId" | "brandId" | "revisionNo">, expectedRevision?: number): Promise<BrandProfileRecord>;
}

function assertRevision(current: { revisionNo: number }, expectedRevision?: number): void { if (expectedRevision !== undefined && current.revisionNo !== expectedRevision) { const error = new Error("Brand revision has changed"); Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 }); throw error; } }

export function createBrandUseCases(repositories: ClientBrandRepositories): BrandUseCases {
  return {
    get: (workspaceId, id) => repositories.getBrand(workspaceId, id),
    list: (workspaceId, advertiserId, includeArchived) => repositories.listBrands(workspaceId, advertiserId, includeArchived),
    create: (workspaceId, advertiserId, input) => repositories.createBrand({ workspaceId, advertiserId, name: input.name, ...(input.logoAssetId ? { logoAssetId: input.logoAssetId } : {}) }),
    async update(workspaceId, id, patch, expectedRevision) { const current = await repositories.getBrand(workspaceId, id); if (!current) throw new Error("Brand not found"); assertRevision(current, expectedRevision); return repositories.updateBrand(workspaceId, id, patch); },
    async archive(workspaceId, id, expectedRevision) { const current = await repositories.getBrand(workspaceId, id); if (!current) throw new Error("Brand not found"); assertRevision(current, expectedRevision); return repositories.archiveBrand(workspaceId, id); },
    getProfile: (workspaceId, brandId) => repositories.getBrandProfile(workspaceId, brandId),
    async updateProfile(workspaceId, brandId, input, expectedRevision) { const current = await repositories.getBrandProfile(workspaceId, brandId); if (current) assertRevision(current, expectedRevision); return repositories.upsertBrandProfile({ ...input, workspaceId, brandId, ...(current ? { id: current.id } : {}) }); },
  };
}
