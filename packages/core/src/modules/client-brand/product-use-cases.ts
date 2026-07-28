import type { ProductRecord, ProductVariantRecord, ClientBrandRepositories } from "./repositories.js";
import { createProductImportCommand, type ProductImportCommand, type ProductImportDependencies, type ProductImportRow } from "./product-import.js";

export interface ProductUseCases {
  get(workspaceId: string, id: string): Promise<ProductRecord | null>;
  list(workspaceId: string, brandId: string, includeArchived?: boolean): Promise<readonly ProductRecord[]>;
  create(input: Omit<ProductRecord, "id" | "normalizedName" | "revisionNo" | "status"> & { status?: ProductRecord["status"] }): Promise<ProductRecord>;
  update(workspaceId: string, id: string, patch: Partial<Pick<ProductRecord, "name" | "internalCode" | "categoryCode" | "landingUrl" | "description" | "sellingPoints" | "attributes" | "representativeAssetId">>, expectedRevision?: number): Promise<ProductRecord>;
  archive(workspaceId: string, id: string, expectedRevision?: number): Promise<ProductRecord>;
  listVariants(workspaceId: string, productId: string, includeArchived?: boolean): Promise<readonly ProductVariantRecord[]>;
  createVariant(input: Omit<ProductVariantRecord, "id" | "revisionNo" | "status"> & { status?: ProductVariantRecord["status"] }): Promise<ProductVariantRecord>;
  updateVariant(workspaceId: string, id: string, patch: Partial<Pick<ProductVariantRecord, "name" | "sku" | "attributes" | "priceMinor" | "salePriceMinor" | "currencyCode" | "availability">>, expectedRevision?: number): Promise<ProductVariantRecord>;
  archiveVariant(workspaceId: string, id: string, expectedRevision?: number): Promise<ProductVariantRecord>;
  createImport(workspaceId: string, rows: readonly ProductImportRow[], dependencies?: ProductImportDependencies): Promise<ProductImportCommand>;
}
function assertRevision(current: { revisionNo: number }, expectedRevision?: number): void { if (expectedRevision !== undefined && current.revisionNo !== expectedRevision) { const error = new Error("Product revision has changed"); Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 }); throw error; } }
export function createProductUseCases(repositories: ClientBrandRepositories): ProductUseCases {
  return {
    get: (workspaceId, id) => repositories.getProduct(workspaceId, id),
    list: (workspaceId, brandId, includeArchived) => repositories.listProducts(workspaceId, brandId, includeArchived),
    create: (input) => repositories.createProduct(input),
    async update(workspaceId, id, patch, expectedRevision) { const current = await repositories.getProduct(workspaceId, id); if (!current) throw new Error("Product not found"); assertRevision(current, expectedRevision); return repositories.updateProduct(workspaceId, id, patch); },
    async archive(workspaceId, id, expectedRevision) { const current = await repositories.getProduct(workspaceId, id); if (!current) throw new Error("Product not found"); assertRevision(current, expectedRevision); return repositories.archiveProduct(workspaceId, id); },
    listVariants: (workspaceId, productId, includeArchived) => repositories.listVariants(workspaceId, productId, includeArchived),
    createVariant: (input) => repositories.createVariant(input),
    async updateVariant(workspaceId, id, patch, expectedRevision) { const current = await repositories.getVariant(workspaceId, id); if (!current) { const error = new Error("Product variant not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; } assertRevision(current, expectedRevision); return repositories.updateVariant(workspaceId, id, patch); },
    async archiveVariant(workspaceId, id, expectedRevision) { const current = await repositories.getVariant(workspaceId, id); if (!current) throw new Error("Product variant not found"); assertRevision(current, expectedRevision); return repositories.archiveVariant(workspaceId, id); },
    createImport: (workspaceId, rows, dependencies) => createProductImportCommand(workspaceId, rows, dependencies),
  };
}
