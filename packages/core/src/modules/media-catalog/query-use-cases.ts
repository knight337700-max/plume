import type { CatalogChannelCode, CatalogChannelRecord, CatalogRepository, FormatProfileRecord } from "./repositories.js";
export interface FormatProfileDetail extends FormatProfileRecord { readonly placements: readonly unknown[]; readonly templates: readonly unknown[] }
export interface CatalogQueryUseCases { listChannels(): Promise<readonly CatalogChannelRecord[]>; listProfiles(channelCode?: CatalogChannelCode, onDate?: string): Promise<readonly FormatProfileRecord[]>; getProfile(id: string): Promise<FormatProfileDetail | null>; getValidationBundle(profileId: string): Promise<{ readonly profileId: string; readonly rules: readonly unknown[]; readonly status: FormatProfileRecord["status"] } | null>; getExportRecipe(profileId: string): Promise<{ readonly profileId: string; readonly recipeId: string; readonly recipe: unknown } | null> }
export function createCatalogQueryUseCases(repository: CatalogRepository): CatalogQueryUseCases {
  return {
    listChannels: () => repository.listChannels(),
    listProfiles: (channelCode, onDate) => repository.listFormatProfiles(channelCode, onDate, true),
    async getProfile(id) { const profile = await repository.getFormatProfile(id); if (!profile) return null; const spec = profile.spec as { placements?: unknown[]; templates?: unknown[] }; return { ...profile, placements: spec.placements ?? [], templates: spec.templates ?? [] }; },
    async getValidationBundle(profileId) { const profile = await repository.getFormatProfile(profileId); if (!profile) return null; const spec = profile.spec as { rules?: unknown[]; validationRules?: unknown[] }; return { profileId, rules: spec.rules ?? spec.validationRules ?? [], status: profile.status }; },
    async getExportRecipe(profileId) { const profile = await repository.getFormatProfile(profileId); if (!profile) return null; return { profileId, recipeId: profile.exportRecipeId, recipe: (profile.spec as { exportRecipe?: unknown }).exportRecipe ?? { id: profile.exportRecipeId } }; },
  };
}
