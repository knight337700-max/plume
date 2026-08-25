import { describe, expect, it } from "vitest";
import { canUseCatalogStatus } from "../../../../../packages/core/src/modules/media-catalog/availability-policy.js";
import { buildApp } from "../../app.js";

describe("catalog query routes", () => {
  it("keeps legacy profiles queryable", () => { expect(canUseCatalogStatus("LEGACY_ONLY", "QUERY").allowed).toBe(true); });

  it("returns the four canonical channels and explicit catalog readiness", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/media-catalog/channels" });
    expect(response.statusCode).toBe(200);
    const channels = response.json().data as Array<{ id: string; productsOrFormats: Array<{ channelCode: string }>; catalogStatus: string }>;
    expect(channels.map((channel) => channel.id)).toEqual(["GOOGLE_ADS", "KAKAO_MOMENT", "META", "NAVER_GFA"]);
    expect(new Set(channels.map((channel) => channel.id)).size).toBe(4);
    expect(channels.find((channel) => channel.id === "KAKAO_MOMENT")?.productsOrFormats[0]?.channelCode).toBe("KAKAO_MOMENT");
    expect(channels.find((channel) => channel.id === "NAVER_GFA")?.catalogStatus).toBe("CATALOG_NOT_READY");
    expect(channels.some((channel) => channel.id === "KAKAO_BIZBOARD")).toBe(false);
    await app.close();
  });

  it("rejects unknown catalog channel format queries", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces/ws-1/media-catalog/format-profiles?channel=UNKNOWN" });
    expect(response.statusCode).toBe(422);
    await app.close();
  });
});
