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
