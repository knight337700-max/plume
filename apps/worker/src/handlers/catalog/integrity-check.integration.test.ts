import { describe, expect, it } from "vitest";
import { createCatalogIntegrityHandler } from "./integrity-check.js";
import { createInMemoryCatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";

describe("catalog integrity worker", () => {
  it("fails broken references while preserving the known pending verification exception", async () => {
    const repository = createInMemoryCatalogRepository({
      channels: [
        { id: "channel-kakao", code: "KAKAO_MOMENT", name: "Kakao Moment", status: "ACTIVE", metadata: {} },
        { id: "channel-naver", code: "NAVER_GFA", name: "Naver GFA", status: "ACTIVE", metadata: {} },
      ],
      profiles: [
        {
          id: "profile-pending",
          channelId: "channel-kakao",
          channelCode: "KAKAO_MOMENT",
          stableKey: "kakao.pending",
          version: "1",
          name: "Kakao pending",
          status: "PENDING_VERIFY",
          renderMode: "STATIC",
          mediaType: "IMAGE",
          spec: {},
          ruleSetId: "rules-kakao",
          exportRecipeId: "export-kakao",
          revisionNo: 1,
        },
        {
          id: "profile-broken",
          channelId: "channel-naver",
          channelCode: "NAVER_GFA",
          stableKey: "naver.broken",
          version: "1",
          name: "Naver broken",
          status: "ACTIVE",
          renderMode: "STATIC",
          mediaType: "IMAGE",
          spec: {},
          ruleSetId: "",
          exportRecipeId: "",
          revisionNo: 1,
        },
      ],
    });

    const report = await createCatalogIntegrityHandler(repository)();

    expect(report.status).toBe("FAILED");
    expect(report.checked).toBe(2);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PENDING_VERIFY", severity: "WARNING" }),
        expect.objectContaining({ code: "MISSING_RULE_SET", severity: "ERROR" }),
        expect.objectContaining({ code: "MISSING_EXPORT_RECIPE", severity: "ERROR" }),
      ]),
    );
  });
});
