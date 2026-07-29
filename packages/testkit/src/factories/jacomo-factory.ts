import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

export const JACOMO_FIXED_NOW = "2026-01-15T12:00:00.000Z";

export const JACOMO_IDS = Object.freeze({
  workspace: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  member: "00000000-0000-4000-8000-000000000103",
  policy: "00000000-0000-4000-8000-000000000104",
  advertiser: "00000000-0000-4000-8000-000000000105",
  brand: "00000000-0000-4000-8000-000000000106",
  brandProfile: "00000000-0000-4000-8000-000000000107",
  sourceFile: "00000000-0000-4000-8000-000000000108",
  source: "00000000-0000-4000-8000-000000000109",
  sourceAnalysis: "00000000-0000-4000-8000-00000000010a",
  campaign: "00000000-0000-4000-8000-00000000010b",
  brief: "00000000-0000-4000-8000-00000000010c",
  briefVersion: "00000000-0000-4000-8000-00000000010d",
  channel: "00000000-0000-4000-8000-00000000010e",
  productFamily: "00000000-0000-4000-8000-00000000010f",
  adProduct: "00000000-0000-4000-8000-000000000110",
  placement: "00000000-0000-4000-8000-000000000111",
  guideline: "00000000-0000-4000-8000-000000000112",
  sourceReference: "00000000-0000-4000-8000-000000000113",
  exportRecipe: "00000000-0000-4000-8000-000000000114",
  formatProfile: "00000000-0000-4000-8000-000000000115",
  formatPlacement: "00000000-0000-4000-8000-000000000116",
  ruleSet: "00000000-0000-4000-8000-000000000117",
  ruleDefinition: "00000000-0000-4000-8000-000000000118",
  formatRuleSet: "00000000-0000-4000-8000-000000000119",
  layoutTemplate: "00000000-0000-4000-8000-00000000011a",
  formatTemplate: "00000000-0000-4000-8000-00000000011b",
  channelSelection: "00000000-0000-4000-8000-00000000011c",
  formatSelection: "00000000-0000-4000-8000-00000000011d",
  generationJob: "00000000-0000-4000-8000-00000000011e",
  generationRequest: "00000000-0000-4000-8000-00000000011f",
  creativeSet: "00000000-0000-4000-8000-000000000120",
} as const);

const productIds = [
  "00000000-0000-4000-8000-000000000121",
  "00000000-0000-4000-8000-000000000122",
  "00000000-0000-4000-8000-000000000123",
] as const;
const variantIds = [
  "00000000-0000-4000-8000-000000000124",
  "00000000-0000-4000-8000-000000000125",
  "00000000-0000-4000-8000-000000000126",
] as const;
const assetIds = [
  "00000000-0000-4000-8000-000000000127",
  "00000000-0000-4000-8000-000000000128",
  "00000000-0000-4000-8000-000000000129",
] as const;
const assetVersionIds = [
  "00000000-0000-4000-8000-00000000012a",
  "00000000-0000-4000-8000-00000000012b",
  "00000000-0000-4000-8000-00000000012c",
] as const;
const assetFileIds = [
  "00000000-0000-4000-8000-00000000012d",
  "00000000-0000-4000-8000-00000000012e",
  "00000000-0000-4000-8000-00000000012f",
] as const;

export interface JacomoProductFixture {
  readonly id: string;
  readonly name: string;
  readonly internalCode: string;
  readonly variant: { readonly id: string; readonly sku: string; readonly name: string };
  readonly asset: {
    readonly id: string;
    readonly versionId: string;
    readonly fileId: string;
    readonly name: string;
    readonly bytes: Buffer;
    readonly checksumSha256: string;
  };
}

export interface JacomoFixture {
  readonly now: string;
  readonly workspace: { readonly id: string; readonly name: string; readonly slug: string };
  readonly owner: { readonly id: string; readonly email: string; readonly displayName: string };
  readonly advertiser: { readonly id: string; readonly name: string };
  readonly brand: { readonly id: string; readonly name: string };
  readonly campaign: { readonly id: string; readonly displayCode: string; readonly name: string };
  readonly source: { readonly fileId: string; readonly id: string };
  readonly brief: { readonly id: string; readonly versionId: string };
  readonly products: readonly JacomoProductFixture[];
  readonly catalog: {
    readonly channelId: string;
    readonly formatProfileId: string;
    readonly layoutTemplateId: string;
    readonly exportRecipeId: string;
  };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function onePixelPng(red: number, green: number, blue: number): Buffer {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.from([0, red, green, blue, 255]);
  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanline)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function assetFixture(
  index: number,
  product: (typeof productIds)[number],
  asset: (typeof assetIds)[number],
  version: (typeof assetVersionIds)[number],
  file: (typeof assetFileIds)[number],
  name: string,
  color: readonly [number, number, number],
): JacomoProductFixture {
  const bytes = onePixelPng(...color);
  return {
    id: product,
    name,
    internalCode: `JACOMO-${String(index).padStart(2, "0")}`,
    variant: {
      id: variantIds[index - 1]!,
      sku: `JACOMO-${String(index).padStart(2, "0")}-V01`,
      name: `${name} 기본형`,
    },
    asset: {
      id: asset,
      versionId: version,
      fileId: file,
      name: `${name} 대표 이미지`,
      bytes,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export function createJacomoFixture(): JacomoFixture {
  return {
    now: JACOMO_FIXED_NOW,
    workspace: {
      id: JACOMO_IDS.workspace,
      name: "자코모 테스트 워크스페이스",
      slug: "jacomo-test",
    },
    owner: { id: JACOMO_IDS.user, email: "jacomo.owner@plume.local", displayName: "자코모 오너" },
    advertiser: { id: JACOMO_IDS.advertiser, name: "자코모" },
    brand: { id: JACOMO_IDS.brand, name: "자코모" },
    campaign: {
      id: JACOMO_IDS.campaign,
      displayCode: "JACOMO-2026-FALL",
      name: "2026 가을 프로모션",
    },
    source: { fileId: JACOMO_IDS.sourceFile, id: JACOMO_IDS.source },
    brief: { id: JACOMO_IDS.brief, versionId: JACOMO_IDS.briefVersion },
    products: [
      assetFixture(
        1,
        productIds[0],
        assetIds[0],
        assetVersionIds[0],
        assetFileIds[0],
        "카르마",
        [190, 45, 45],
      ),
      assetFixture(
        2,
        productIds[1],
        assetIds[1],
        assetVersionIds[1],
        assetFileIds[1],
        "플룸",
        [35, 95, 190],
      ),
      assetFixture(
        3,
        productIds[2],
        assetIds[2],
        assetVersionIds[2],
        assetFileIds[2],
        "엘리쉬",
        [45, 155, 85],
      ),
    ],
    catalog: {
      channelId: JACOMO_IDS.channel,
      formatProfileId: JACOMO_IDS.formatProfile,
      layoutTemplateId: JACOMO_IDS.layoutTemplate,
      exportRecipeId: JACOMO_IDS.exportRecipe,
    },
  };
}

export const jacomoFixture = createJacomoFixture();

export const JACOMO_SOURCE_BYTES = Buffer.from(
  "자코모 2026 가을 프로모션\n카르마, 플룸, 엘리쉬를 소개하는 카카오모먼트 소재 안내입니다.",
  "utf8",
);
export const JACOMO_SOURCE_CHECKSUM_SHA256 = createHash("sha256")
  .update(JACOMO_SOURCE_BYTES)
  .digest("hex");
