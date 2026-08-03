import { randomUUID } from "node:crypto";
import {
  APPROVED_FORMAT_PROFILES,
  CANONICAL_CHANNELS,
  type CanonicalChannelCode,
} from "./canonical-catalog.js";

export type CatalogChannelCode = CanonicalChannelCode;
export type CatalogStatus = "DRAFT" | "ACTIVE" | "PENDING_VERIFY" | "FEATURE_DEPENDENT" | "LEGACY_ONLY" | "DISABLED";
export interface CatalogChannelRecord { readonly id: string; readonly code: CatalogChannelCode; readonly name: string; readonly status: "ACTIVE" | "DISABLED"; readonly metadata: Readonly<Record<string, unknown>> }
export interface FormatProfileRecord { readonly id: string; readonly channelId: string; readonly channelCode: CatalogChannelCode; readonly productCode?: string; readonly productName?: string; readonly specificationVersion?: string; readonly stableKey: string; readonly version: string; readonly name: string; readonly status: CatalogStatus; readonly renderMode: string; readonly mediaType: string; readonly spec: Readonly<Record<string, unknown>>; readonly ruleSetId: string; readonly exportRecipeId: string; readonly effectiveFrom?: string; readonly effectiveTo?: string; readonly sourceHash?: string; readonly revisionNo: number }
export interface CatalogRepository {
  listChannels(): Promise<readonly CatalogChannelRecord[]>;
  getChannel(code: CatalogChannelCode): Promise<CatalogChannelRecord | null>;
  listFormatProfiles(channelCode?: CatalogChannelCode, onDate?: string, includeNonActive?: boolean): Promise<readonly FormatProfileRecord[]>;
  getFormatProfile(id: string): Promise<FormatProfileRecord | null>;
  getFormatProfileByKey(stableKey: string, version: string): Promise<FormatProfileRecord | null>;
  insertChannel(input: Omit<CatalogChannelRecord, "id"> & { id?: string }): Promise<CatalogChannelRecord>;
  insertFormatProfile(input: Omit<FormatProfileRecord, "id" | "revisionNo"> & { id?: string }): Promise<FormatProfileRecord>;
  updateFormatProfileStatus(id: string, status: CatalogStatus, expectedRevision?: number): Promise<FormatProfileRecord>;
}
export interface CatalogSeed { readonly channels?: readonly CatalogChannelRecord[]; readonly profiles?: readonly FormatProfileRecord[] }
function notFound(kind: string): Error { const error = new Error(`${kind} not found`); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); return error; }
function activeOn(item: FormatProfileRecord, onDate?: string): boolean { if (!onDate) return true; return (!item.effectiveFrom || item.effectiveFrom <= onDate) && (!item.effectiveTo || item.effectiveTo >= onDate); }

export function createInMemoryCatalogRepository(seed: CatalogSeed = {}): CatalogRepository {
  const channels = new Map((seed.channels ?? []).map((item) => [item.code, item]));
  const profiles = new Map((seed.profiles ?? []).map((item) => [item.id, item]));
  return {
    async listChannels() { return [...channels.values()].sort((a, b) => a.code.localeCompare(b.code)); },
    async getChannel(code) { return channels.get(code) ?? null; },
    async listFormatProfiles(channelCode, onDate, includeNonActive = false) { return [...profiles.values()].filter((item) => (!channelCode || item.channelCode === channelCode) && activeOn(item, onDate) && (includeNonActive || item.status === "ACTIVE")); },
    async getFormatProfile(id) { return profiles.get(id) ?? null; },
    async getFormatProfileByKey(stableKey, version) { return [...profiles.values()].find((item) => item.stableKey === stableKey && item.version === version) ?? null; },
    async insertChannel(input) { const current = channels.get(input.code); if (current) return current; const item = Object.freeze({ id: input.id ?? randomUUID(), ...input }); channels.set(item.code, item); return item; },
    async insertFormatProfile(input) { const duplicate = [...profiles.values()].find((item) => item.stableKey === input.stableKey && item.version === input.version); if (duplicate) return duplicate; if (!channels.has(input.channelCode)) throw notFound("Catalog channel"); const item = Object.freeze({ id: input.id ?? randomUUID(), ...input, revisionNo: 1 }); profiles.set(item.id, item); return item; },
    async updateFormatProfileStatus(id, status, expectedRevision) { const current = profiles.get(id); if (!current) throw notFound("Format profile"); if (expectedRevision !== undefined && current.revisionNo !== expectedRevision) { const error = new Error("Format profile revision has changed"); Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 }); throw error; } const item = Object.freeze({ ...current, status, revisionNo: current.revisionNo + 1 }); profiles.set(id, item); return item; },
  };
}

export function createCanonicalCatalogRepository(): CatalogRepository {
  const channels = CANONICAL_CHANNELS.map((channel) => ({
    id: channel.id,
    code: channel.id,
    name: channel.label,
    status: "ACTIVE" as const,
    metadata: { enabled: channel.enabled, sortOrder: channel.sortOrder },
  }));
  const profiles = APPROVED_FORMAT_PROFILES.map((profile) => ({
    id: profile.id,
    channelId: profile.channelCode,
    channelCode: profile.channelCode,
    productCode: profile.productCode,
    productName: profile.productName,
    specificationVersion: profile.specificationVersion,
    stableKey: profile.stableKey,
    version: profile.version,
    name: profile.name,
    status: profile.status,
    renderMode: profile.renderMode,
    mediaType: profile.mediaType,
    spec: profile.spec,
    ruleSetId: profile.ruleSetId,
    exportRecipeId: profile.exportRecipeId,
    revisionNo: 1,
  }));
  return createInMemoryCatalogRepository({ channels, profiles });
}
