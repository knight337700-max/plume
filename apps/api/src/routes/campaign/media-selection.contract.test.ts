import { describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

describe("campaign media selection routes", () => {
  it("persists idempotent channel selections and exposes options/selections", async () => {
    const app = await buildApp();
    const campaign = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/ws-1/brands/brand-1/campaigns",
      payload: { displayCode: "C-001", name: "Launch", objectiveCode: "SALES" },
    });
    const campaignId = campaign.json().data.id;
    const update = await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/channels`,
      payload: { items: [{ channelCode: "KAKAO_MOMENT" }] },
    });
    expect(update.statusCode).toBe(200);
    const channels = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/channels`,
    });
    expect(channels.json().items).toHaveLength(1);
    const formats = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-options?channelCode=KAKAO_MOMENT`,
    });
    expect(formats.statusCode).toBe(200);
    expect(formats.json().items.map((item: { readonly id: string }) => item.id)).toEqual([
      "kakao-moment-bizboard-1029x258",
      "kakao-moment-bizboard-thumbnail-box-right-1029x258",
      "kakao-moment-display-native-2-1-1200x600",
    ]);
    const formatProfileId = formats.json().items[0].id as string;
    const formatSelection = await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-selections`,
      payload: { items: [{ channelCode: "KAKAO_MOMENT", formatProfileId }] },
    });
    expect(formatSelection.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-selections`,
        })
      ).json().items,
    ).toHaveLength(1);
    const switched = await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/channels`,
      payload: { items: [{ channelCode: "META" }] },
    });
    expect(switched.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-selections`,
        })
      ).json().items,
    ).toHaveLength(0);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-options?channelCode=NAVER_GFA`,
        })
      ).json().items,
    ).toHaveLength(0);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/workspaces/ws-1/campaigns/${campaignId}/format-options?channelCode=UNKNOWN`,
        })
      ).statusCode,
    ).toBe(422);
    await app.close();
  });
});
