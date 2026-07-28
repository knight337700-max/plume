import { randomUUID } from "node:crypto";

export type EntityStatus = "ACTIVE" | "ARCHIVED" | "DRAFT";
export interface AdvertiserRecord { readonly id: string; readonly workspaceId: string; readonly name: string; readonly normalizedName: string; readonly status: "ACTIVE" | "ARCHIVED"; readonly ownerUserId?: string; readonly revisionNo: number }
export interface BrandRecord { readonly id: string; readonly workspaceId: string; readonly advertiserId: string; readonly name: string; readonly normalizedName: string; readonly status: "ACTIVE" | "ARCHIVED"; readonly logoAssetId?: string; readonly revisionNo: number }
export interface BrandProfileRecord { readonly id: string; readonly workspaceId: string; readonly brandId: string; readonly brandMessage?: string; readonly toneJson: Readonly<Record<string, unknown>>; readonly colorTokensJson: Readonly<Record<string, unknown>>; readonly forbiddenExpressionsJson: readonly unknown[]; readonly revisionNo: number }
export interface ProductRecord { readonly id: string; readonly workspaceId: string; readonly brandId: string; readonly name: string; readonly normalizedName: string; readonly internalCode?: string; readonly categoryCode?: string; readonly landingUrl?: string; readonly description?: string; readonly sellingPoints: readonly unknown[]; readonly attributes: Readonly<Record<string, unknown>>; readonly status: "DRAFT" | "ACTIVE" | "ARCHIVED"; readonly representativeAssetId?: string; readonly revisionNo: number }
export interface ProductVariantRecord { readonly id: string; readonly workspaceId: string; readonly productId: string; readonly sku?: string; readonly name: string; readonly attributes: Readonly<Record<string, unknown>>; readonly priceMinor?: bigint; readonly salePriceMinor?: bigint; readonly currencyCode?: string; readonly availability?: string; readonly status: "ACTIVE" | "INACTIVE" | "ARCHIVED"; readonly revisionNo: number }

export interface ClientBrandRepositories {
  listAdvertisers(workspaceId: string, includeArchived?: boolean): Promise<readonly AdvertiserRecord[]>;
  getAdvertiser(workspaceId: string, id: string): Promise<AdvertiserRecord | null>;
  createAdvertiser(input: Omit<AdvertiserRecord, "id" | "normalizedName" | "revisionNo" | "status"> & { id?: string }): Promise<AdvertiserRecord>;
  updateAdvertiser(workspaceId: string, id: string, patch: Partial<Pick<AdvertiserRecord, "name" | "ownerUserId">>): Promise<AdvertiserRecord>;
  archiveAdvertiser(workspaceId: string, id: string): Promise<AdvertiserRecord>;
  listBrands(workspaceId: string, advertiserId: string, includeArchived?: boolean): Promise<readonly BrandRecord[]>;
  getBrand(workspaceId: string, id: string): Promise<BrandRecord | null>;
  createBrand(input: Omit<BrandRecord, "id" | "normalizedName" | "revisionNo" | "status"> & { id?: string }): Promise<BrandRecord>;
  updateBrand(workspaceId: string, id: string, patch: Partial<Pick<BrandRecord, "name" | "logoAssetId">>): Promise<BrandRecord>;
  archiveBrand(workspaceId: string, id: string): Promise<BrandRecord>;
  getBrandProfile(workspaceId: string, brandId: string): Promise<BrandProfileRecord | null>;
  upsertBrandProfile(input: Omit<BrandProfileRecord, "id" | "revisionNo"> & { id?: string }): Promise<BrandProfileRecord>;
  listProducts(workspaceId: string, brandId: string, includeArchived?: boolean): Promise<readonly ProductRecord[]>;
  getProduct(workspaceId: string, id: string): Promise<ProductRecord | null>;
  createProduct(input: Omit<ProductRecord, "id" | "normalizedName" | "revisionNo" | "status"> & { id?: string; status?: ProductRecord["status"] }): Promise<ProductRecord>;
  updateProduct(workspaceId: string, id: string, patch: Partial<Pick<ProductRecord, "name" | "internalCode" | "categoryCode" | "landingUrl" | "description" | "sellingPoints" | "attributes" | "representativeAssetId">>): Promise<ProductRecord>;
  archiveProduct(workspaceId: string, id: string): Promise<ProductRecord>;
  listVariants(workspaceId: string, productId: string, includeArchived?: boolean): Promise<readonly ProductVariantRecord[]>;
  createVariant(input: Omit<ProductVariantRecord, "id" | "revisionNo" | "status"> & { id?: string; status?: ProductVariantRecord["status"] }): Promise<ProductVariantRecord>;
  updateVariant(workspaceId: string, id: string, patch: Partial<Pick<ProductVariantRecord, "name" | "sku" | "attributes" | "priceMinor" | "salePriceMinor" | "currencyCode" | "availability">>): Promise<ProductVariantRecord>;
  archiveVariant(workspaceId: string, id: string): Promise<ProductVariantRecord>;
}

export interface ClientBrandSeed { readonly advertisers?: readonly AdvertiserRecord[]; readonly brands?: readonly BrandRecord[]; readonly profiles?: readonly BrandProfileRecord[]; readonly products?: readonly ProductRecord[]; readonly variants?: readonly ProductVariantRecord[] }
const normalize = (value: string): string => value.trim().toLocaleLowerCase("en-US");
function notFound(kind: string): Error { const error = new Error(`${kind} not found`); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }
function revision<T extends { revisionNo: number }, P extends object>(current: T, patch: P): T & P { return Object.freeze({ ...current, ...patch, revisionNo: current.revisionNo + 1 }) as T & P; }

export function createInMemoryClientBrandRepositories(seed: ClientBrandSeed = {}): ClientBrandRepositories {
  const advertisers = new Map((seed.advertisers ?? []).map((item) => [item.id, item]));
  const brands = new Map((seed.brands ?? []).map((item) => [item.id, item]));
  const profiles = new Map((seed.profiles ?? []).map((item) => [item.brandId, item]));
  const products = new Map((seed.products ?? []).map((item) => [item.id, item]));
  const variants = new Map((seed.variants ?? []).map((item) => [item.id, item]));
  function advertiser(workspaceId: string, id: string) { const item = advertisers.get(id); if (!item || item.workspaceId !== workspaceId) throw notFound("Advertiser"); return item; }
  function brand(workspaceId: string, id: string) { const item = brands.get(id); if (!item || item.workspaceId !== workspaceId) throw notFound("Brand"); return item; }
  function product(workspaceId: string, id: string) { const item = products.get(id); if (!item || item.workspaceId !== workspaceId) throw notFound("Product"); return item; }
  return {
    async listAdvertisers(workspaceId, includeArchived = false) { return [...advertisers.values()].filter((item) => item.workspaceId === workspaceId && (includeArchived || item.status !== "ARCHIVED")); },
    async getAdvertiser(workspaceId, id) { const item = advertisers.get(id); return item?.workspaceId === workspaceId ? item : null; },
    async createAdvertiser(input) { const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, normalizedName: normalize(input.name), status: "ACTIVE" as const, revisionNo: 1 }); if ([...advertisers.values()].some((other) => other.workspaceId === item.workspaceId && other.normalizedName === item.normalizedName && other.status !== "ARCHIVED")) throw new Error("Advertiser name already exists"); advertisers.set(item.id, item); return item; },
    async updateAdvertiser(workspaceId, id, patch) { const current = advertiser(workspaceId, id); const next = revision(current, { ...patch, ...(patch.name ? { normalizedName: normalize(patch.name) } : {}) }); advertisers.set(id, next); return next; },
    async archiveAdvertiser(workspaceId, id) { const next = revision(advertiser(workspaceId, id), { status: "ARCHIVED" }); advertisers.set(id, next); return next; },
    async listBrands(workspaceId, advertiserId, includeArchived = false) { advertiser(workspaceId, advertiserId); return [...brands.values()].filter((item) => item.workspaceId === workspaceId && item.advertiserId === advertiserId && (includeArchived || item.status !== "ARCHIVED")); },
    async getBrand(workspaceId, id) { const item = brands.get(id); return item?.workspaceId === workspaceId ? item : null; },
    async createBrand(input) { advertiser(input.workspaceId, input.advertiserId); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, normalizedName: normalize(input.name), status: "ACTIVE" as const, revisionNo: 1 }); if ([...brands.values()].some((other) => other.advertiserId === item.advertiserId && other.normalizedName === item.normalizedName && other.status !== "ARCHIVED")) throw new Error("Brand name already exists"); brands.set(item.id, item); return item; },
    async updateBrand(workspaceId, id, patch) { const current = brand(workspaceId, id); const next = revision(current, { ...patch, ...(patch.name ? { normalizedName: normalize(patch.name) } : {}) }); brands.set(id, next); return next; },
    async archiveBrand(workspaceId, id) { const next = revision(brand(workspaceId, id), { status: "ARCHIVED" }); brands.set(id, next); return next; },
    async getBrandProfile(workspaceId, brandId) { brand(workspaceId, brandId); const item = profiles.get(brandId); return item?.workspaceId === workspaceId ? item : null; },
    async upsertBrandProfile(input) { brand(input.workspaceId, input.brandId); const current = profiles.get(input.brandId); const next = Object.freeze({ id: input.id ?? current?.id ?? randomUUID(), ...input, toneJson: input.toneJson ?? {}, colorTokensJson: input.colorTokensJson ?? {}, forbiddenExpressionsJson: input.forbiddenExpressionsJson ?? [], revisionNo: (current?.revisionNo ?? 0) + 1 }); profiles.set(input.brandId, next); return next; },
    async listProducts(workspaceId, brandId, includeArchived = false) { brand(workspaceId, brandId); return [...products.values()].filter((item) => item.workspaceId === workspaceId && item.brandId === brandId && (includeArchived || item.status !== "ARCHIVED")); },
    async getProduct(workspaceId, id) { const item = products.get(id); return item?.workspaceId === workspaceId ? item : null; },
    async createProduct(input) { brand(input.workspaceId, input.brandId); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, normalizedName: normalize(input.name), status: input.status ?? "DRAFT", sellingPoints: input.sellingPoints ?? [], attributes: input.attributes ?? {}, revisionNo: 1 }); products.set(item.id, item); return item; },
    async updateProduct(workspaceId, id, patch) { const current = product(workspaceId, id); const next = revision(current, { ...patch, ...(patch.name ? { normalizedName: normalize(patch.name) } : {}) }); products.set(id, next); return next; },
    async archiveProduct(workspaceId, id) { const next = revision(product(workspaceId, id), { status: "ARCHIVED" }); products.set(id, next); return next; },
    async listVariants(workspaceId, productId, includeArchived = false) { product(workspaceId, productId); return [...variants.values()].filter((item) => item.workspaceId === workspaceId && item.productId === productId && (includeArchived || item.status !== "ARCHIVED")); },
    async createVariant(input) { product(input.workspaceId, input.productId); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, attributes: input.attributes ?? {}, status: input.status ?? "ACTIVE", revisionNo: 1 }); if ([...variants.values()].some((other) => other.productId === item.productId && item.sku && other.sku === item.sku && other.status !== "ARCHIVED")) throw new Error("Variant SKU already exists"); variants.set(item.id, item); return item; },
    async updateVariant(workspaceId, id, patch) { const current = variants.get(id); if (!current || current.workspaceId !== workspaceId) throw notFound("Product variant"); const next = revision(current, patch); variants.set(id, next); return next; },
    async archiveVariant(workspaceId, id) { const current = variants.get(id); if (!current || current.workspaceId !== workspaceId) throw notFound("Product variant"); const next = revision(current, { status: "ARCHIVED" }); variants.set(id, next); return next; },
  };
}
