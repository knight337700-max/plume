import type { CatalogRepository, CatalogChannelCode, FormatProfileRecord } from "../media-catalog/repositories.js";
import { assertCatalogAvailable } from "../media-catalog/availability-policy.js";
import { isCanonicalChannelCode } from "../media-catalog/canonical-catalog.js";

export interface ChannelSelectionInput { readonly channelCode: CatalogChannelCode }
export interface FormatSelectionInput { readonly channelCode: CatalogChannelCode; readonly formatProfileId: string }
export interface MediaSelectionSnapshot { readonly channels: readonly { readonly channelCode: CatalogChannelCode; readonly versionId: string }[]; readonly formats: readonly { readonly channelCode: CatalogChannelCode; readonly profileId: string; readonly profileVersion: string; readonly status: FormatProfileRecord["status"] }[] }
export interface MediaSelectionUseCases { options(channelCode?: CatalogChannelCode): Promise<readonly FormatProfileRecord[]>; validate(input: { readonly channels: readonly ChannelSelectionInput[]; readonly formats: readonly FormatSelectionInput[] }): Promise<MediaSelectionSnapshot> }

export function createMediaSelectionUseCases(repository: CatalogRepository): MediaSelectionUseCases {
  async function assertChannelSelectable(channelCode: unknown): Promise<void> {
    if (!isCanonicalChannelCode(channelCode)) { const error = new Error("Unknown catalog channel"); Object.assign(error, { code: "CATALOG_CHANNEL_INVALID", statusCode: 422 }); throw error; }
    const channel = await repository.getChannel(channelCode);
    if (!channel || channel.status !== "ACTIVE") { const error = new Error("Catalog channel is disabled or unavailable"); Object.assign(error, { code: "CATALOG_CHANNEL_UNAVAILABLE", statusCode: 422 }); throw error; }
  }
  return {
    options: async (channelCode) => { if (channelCode !== undefined) await assertChannelSelectable(channelCode); return repository.listFormatProfiles(channelCode, undefined, true); },
    async validate(input) {
      const channels = [] as { channelCode: CatalogChannelCode; versionId: string }[];
      for (const channel of input.channels) { await assertChannelSelectable(channel.channelCode); channels.push({ channelCode: channel.channelCode, versionId: channel.channelCode }); }
      const formats = [] as { channelCode: CatalogChannelCode; profileId: string; profileVersion: string; status: FormatProfileRecord["status"] }[];
      for (const selection of input.formats) {
        await assertChannelSelectable(selection.channelCode);
        const profile = await repository.getFormatProfile(selection.formatProfileId);
        if (!profile || profile.channelCode !== selection.channelCode) { const error = new Error("Format profile does not belong to the selected channel"); Object.assign(error, { code: "FORMAT_PROFILE_CHANNEL_MISMATCH", statusCode: 422 }); throw error; }
        assertCatalogAvailable(profile, "SELECT");
        formats.push({ channelCode: selection.channelCode, profileId: profile.id, profileVersion: profile.version, status: profile.status });
      }
      return { channels, formats };
    },
  };
}
