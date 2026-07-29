import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildExportPackage, createDeterministicZip, sanitizeRelativePath } from "./build-package.js";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

describe("JACOMO export package", () => {
  it("creates a deterministic ZIP with the golden file structure and manifest", () => {
    const input = {
      exportJobId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      workspaceId: "44444444-4444-4444-8444-444444444444",
      campaignId: "55555555-5555-4555-8555-555555555555",
      recipe: { id: "kakao.full-canvas.300kb", packageType: "ZIP", includeManifest: true, includeValidationReport: true },
      items: [{ creativeVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", relativePath: "KAKAO/BIZBOARD/1029x258/플룸.png", bytes: png }],
      manifest: { advertiser: { name: "자코모" }, brand: { name: "자코모" }, campaign: { name: "2026 가을 프로모션" }, product: { name: "플룸" }, channel: { code: "KAKAO_MOMENT" }, formatProfile: { id: "kakao.bizboard.banner.standard.v2025-07-09" }, validationRun: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, approval: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" } },
    } as const;
    const first = buildExportPackage(input);
    const second = buildExportPackage(input);
    expect(first.zipBytes).toEqual(second.zipBytes);
    expect(first.checksumSha256).toBe(createHash("sha256").update(first.zipBytes).digest("hex"));
    expect(first.files.map((file) => file.relativePath)).toEqual(["KAKAO/BIZBOARD/1029x258/플룸.png", "validation-report.csv", "manifest.json", "dddddddd-dddd-4ddd-8ddd-dddddddddddd.zip"]);
    expect(first.manifest).toMatchObject({ workspaceId: input.workspaceId, campaignId: input.campaignId, advertiser: input.manifest.advertiser, brand: input.manifest.brand, exportJobId: input.exportJobId });
    expect(first.zipBytes.slice(0, 4)).toEqual(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("sanitizes traversal, reserved names and resolves collisions deterministically", () => {
    expect(sanitizeRelativePath("../../CON/a:b?.png")).toBe("_CON/a_b_.png");
    const first = buildExportPackage({ exportJobId: "job-1", recipe: { includeManifest: false, includeValidationReport: false }, items: [{ creativeVersionId: "v1", relativePath: "folder/a.png", bytes: png }, { creativeVersionId: "v2", relativePath: "folder/a.png", bytes: png }] });
    expect(first.files.map((file) => file.relativePath)).toEqual(["folder/a.png", "folder/a-2.png", "job-1.zip"]);
  });

  it("lets the recipe control manifest and report inclusion", () => {
    const result = buildExportPackage({ exportJobId: "job-2", recipe: { includeManifest: false, includeValidationReport: false, includeCopyCsv: true }, items: [{ creativeVersionId: "v1", relativePath: "creative.png", bytes: png, copyCsv: "headline,hello" }] });
    expect(result.files.map((file) => file.role)).toEqual(["CREATIVE", "COPY_CSV", "PACKAGE"]);
  });
});
