import { describe, expect, it } from "vitest";
import { createMediaSelectionUseCases } from "./media-selection-use-cases.js";
import { createInMemoryCatalogRepository } from "../media-catalog/repositories.js";

describe("campaign media selection", () => {
  it("rejects pending verification profiles and snapshots selected version IDs", async () => {
    const repository = createInMemoryCatalogRepository({ channels: [{ id: "channel-kakao", code: "KAKAO_MOMENT", name: "Kakao", status: "ACTIVE", metadata: {} }], profiles: [{ id: "profile-bizboard", channelId: "channel-kakao", channelCode: "KAKAO_MOMENT", stableKey: "kakao.bizboard", version: "3", name: "Bizboard", status: "ACTIVE", renderMode: "PLATFORM_COMPOSED", mediaType: "IMAGE", spec: {}, ruleSetId: "rules-3", exportRecipeId: "export-3", revisionNo: 1 }, { id: "profile-pending", channelId: "channel-kakao", channelCode: "KAKAO_MOMENT", stableKey: "kakao.pending", version: "4", name: "Pending", status: "PENDING_VERIFY", renderMode: "PLATFORM_COMPOSED", mediaType: "IMAGE", spec: {}, ruleSetId: "rules-4", exportRecipeId: "export-4", revisionNo: 1 }] });
    const selection = createMediaSelectionUseCases(repository);
    const snapshot = await selection.validate({ channels: [{ channelCode: "KAKAO_MOMENT" }], formats: [{ channelCode: "KAKAO_MOMENT", formatProfileId: "profile-bizboard" }] });
    expect(snapshot.formats[0]).toMatchObject({ profileId: "profile-bizboard", profileVersion: "3" });
    await expect(selection.validate({ channels: [{ channelCode: "KAKAO_MOMENT" }], formats: [{ channelCode: "KAKAO_MOMENT", formatProfileId: "profile-pending" }] })).rejects.toMatchObject({ code: "CATALOG_FORMAT_UNAVAILABLE" });
  });
});

describe("canonical channel routing", () => {
  it("supports all canonical channels and filters formats by channel", async () => {
    const repository = createInMemoryCatalogRepository({
      channels: [
        { id: "channel-naver", code: "NAVER_GFA", name: "Naver GFA", status: "ACTIVE", metadata: {} },
        { id: "channel-kakao", code: "KAKAO_MOMENT", name: "Kakao Moment", status: "ACTIVE", metadata: {} },
        { id: "channel-meta", code: "META", name: "Meta", status: "ACTIVE", metadata: {} },
        { id: "channel-google", code: "GOOGLE_ADS", name: "Google Ads", status: "ACTIVE", metadata: {} },
      ],
      profiles: [{ id: "kakao-bizboard", channelId: "channel-kakao", channelCode: "KAKAO_MOMENT", stableKey: "kakao.bizboard", version: "2026.1", name: "Bizboard", productCode: "BIZBOARD", status: "ACTIVE", renderMode: "SERVER_RENDER", mediaType: "PNG", spec: {}, ruleSetId: "rules", exportRecipeId: "recipe", revisionNo: 1 }],
    });
    const selection = createMediaSelectionUseCases(repository);
    expect(await selection.options("NAVER_GFA")).toEqual([]);
    expect((await selection.options("KAKAO_MOMENT")).map((format) => format.productCode)).toEqual(["BIZBOARD"]);
    expect(await selection.options("META")).toEqual([]);
    expect(await selection.options("GOOGLE_ADS")).toEqual([]);
    await expect(selection.options("UNKNOWN" as never)).rejects.toMatchObject({ code: "CATALOG_CHANNEL_INVALID" });
  });

  it("rejects a channel and format combination before any provider boundary", async () => {
    const repository = createInMemoryCatalogRepository({
      channels: [{ id: "channel-kakao", code: "KAKAO_MOMENT", name: "Kakao Moment", status: "ACTIVE", metadata: {} }, { id: "channel-meta", code: "META", name: "Meta", status: "ACTIVE", metadata: {} }],
      profiles: [{ id: "kakao-bizboard", channelId: "channel-kakao", channelCode: "KAKAO_MOMENT", stableKey: "kakao.bizboard", version: "2026.1", name: "Bizboard", status: "ACTIVE", renderMode: "SERVER_RENDER", mediaType: "PNG", spec: {}, ruleSetId: "rules", exportRecipeId: "recipe", revisionNo: 1 }],
    });
    const selection = createMediaSelectionUseCases(repository);
    await expect(selection.validate({ channels: [{ channelCode: "META" }], formats: [{ channelCode: "META", formatProfileId: "kakao-bizboard" }] })).rejects.toMatchObject({ code: "FORMAT_PROFILE_CHANNEL_MISMATCH" });
  });
});
