import type { AdvertiserRecord, ClientBrandRepositories } from "./repositories.js";

export interface AdvertiserUseCases {
  list(workspaceId: string, includeArchived?: boolean): Promise<readonly AdvertiserRecord[]>;
  create(workspaceId: string, input: { readonly name: string; readonly ownerUserId?: string }): Promise<AdvertiserRecord>;
  update(workspaceId: string, id: string, patch: Partial<Pick<AdvertiserRecord, "name" | "ownerUserId">>, expectedRevision?: number): Promise<AdvertiserRecord>;
  archive(workspaceId: string, id: string, expectedRevision?: number): Promise<AdvertiserRecord>;
}

function assertRevision(current: AdvertiserRecord, expectedRevision?: number): void { if (expectedRevision !== undefined && current.revisionNo !== expectedRevision) { const error = new Error("Advertiser revision has changed"); Object.assign(error, { code: "REVISION_MISMATCH", statusCode: 412 }); throw error; } }

export function createAdvertiserUseCases(repositories: ClientBrandRepositories): AdvertiserUseCases {
  return {
    list: (workspaceId, includeArchived) => repositories.listAdvertisers(workspaceId, includeArchived),
    create: (workspaceId, input) => repositories.createAdvertiser({ workspaceId, name: input.name, ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}) }),
    async update(workspaceId, id, patch, expectedRevision) { const current = await repositories.getAdvertiser(workspaceId, id); if (!current) throw new Error("Advertiser not found"); assertRevision(current, expectedRevision); return repositories.updateAdvertiser(workspaceId, id, patch); },
    async archive(workspaceId, id, expectedRevision) { const current = await repositories.getAdvertiser(workspaceId, id); if (!current) throw new Error("Advertiser not found"); assertRevision(current, expectedRevision); return repositories.archiveAdvertiser(workspaceId, id); },
  };
}
