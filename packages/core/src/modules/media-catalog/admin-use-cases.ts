import { randomUUID } from "node:crypto";
import type { CatalogRepository, CatalogStatus, FormatProfileRecord } from "./repositories.js";

export interface CatalogAdminUseCases {
  createFormatProfile(input: Omit<FormatProfileRecord, "id" | "revisionNo">): Promise<FormatProfileRecord>;
  updateFormatProfileStatus(id: string, status: CatalogStatus, expectedRevision?: number): Promise<FormatProfileRecord>;
}
export interface VersionedCatalogRecord { readonly id: string; readonly stableKey: string; readonly version: string; readonly status: CatalogStatus; readonly payload: Readonly<Record<string, unknown>> }
export interface VersionedCatalogAdmin { create(input: Omit<VersionedCatalogRecord, "id">): VersionedCatalogRecord; list(stableKey?: string): readonly VersionedCatalogRecord[] }
export function createCatalogAdminUseCases(repository: CatalogRepository): CatalogAdminUseCases {
  return {
    async createFormatProfile(input) { const current = await repository.getFormatProfileByKey(input.stableKey, input.version); if (current) { const error = new Error("Catalog version already exists and is immutable"); Object.assign(error, { code: "CATALOG_VERSION_CONFLICT", statusCode: 409 }); throw error; } return repository.insertFormatProfile(input); },
    updateFormatProfileStatus: (id, status, expectedRevision) => repository.updateFormatProfileStatus(id, status, expectedRevision),
  };
}
export function createVersionedCatalogAdmin(): VersionedCatalogAdmin {
  const records: VersionedCatalogRecord[] = [];
  return { create(input) { if (records.some((item) => item.stableKey === input.stableKey && item.version === input.version)) throw new Error("Catalog version already exists"); const item = Object.freeze({ id: randomUUID(), ...input }); records.push(item); return item; }, list(stableKey) { return records.filter((item) => !stableKey || item.stableKey === stableKey); } };
}
