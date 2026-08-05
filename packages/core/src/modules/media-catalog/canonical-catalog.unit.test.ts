import { describe, expect, it } from "vitest";
import { APPROVED_FORMAT_PROFILES, CANONICAL_CHANNELS, formatsForCanonicalChannel } from "./canonical-catalog.js";
import { createCanonicalCatalogRepository } from "./repositories.js";

describe("canonical media channel catalog", () => {
  it("contains four unique top-level channels and keeps Bizboard below Kakao Moment", async () => {
    expect(CANONICAL_CHANNELS.map((channel) => channel.id)).toEqual(["NAVER_GFA", "KAKAO_MOMENT", "META", "GOOGLE_ADS"]);
    expect(new Set(CANONICAL_CHANNELS.map((channel) => channel.id)).size).toBe(4);
    expect(CANONICAL_CHANNELS.some((channel) => channel.id === "KAKAO_BIZBOARD")).toBe(false);
    expect(formatsForCanonicalChannel("KAKAO_MOMENT").map((format) => format.productCode)).toEqual(["BIZBOARD"]);
    expect(formatsForCanonicalChannel("NAVER_GFA")).toEqual([]);
    expect((await createCanonicalCatalogRepository().listChannels()).map((channel) => channel.code)).toEqual(["GOOGLE_ADS", "KAKAO_MOMENT", "META", "NAVER_GFA"]);
  });

  it("keeps approved format identifiers stable", () => {
    expect(new Set(APPROVED_FORMAT_PROFILES.map((format) => format.id)).size).toBe(APPROVED_FORMAT_PROFILES.length);
    expect(APPROVED_FORMAT_PROFILES.every((format) => format.status === "ACTIVE")).toBe(true);
  });
});
