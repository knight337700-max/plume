export const JACOMO_AGENT_NAMES = Object.freeze([
  "Campaign Analyst",
  "Product Matcher",
  "Asset Curator",
  "Copy Generator",
  "Layout Planner",
  "Natural Language Editor",
  "AI Policy Reviewer",
  "Export Assistant",
] as const);

export type JacomoAgentName = (typeof JACOMO_AGENT_NAMES)[number];

export const JACOMO_AGENT_RESPONSES: Readonly<Record<JacomoAgentName, Record<string, unknown>>> =
  Object.freeze({
    "Campaign Analyst": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      objective: "가을 시즌 매출 증대",
      audience: "가족 단위 주거 고객",
      season: "2026-FALL",
      confidence: 0.98,
    },
    "Product Matcher": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      matches: [
        {
          productId: "00000000-0000-4000-8000-000000000121",
          productName: "카르마",
          score: 0.98,
          sortOrder: 1,
        },
        {
          productId: "00000000-0000-4000-8000-000000000122",
          productName: "플룸",
          score: 0.94,
          sortOrder: 2,
        },
        {
          productId: "00000000-0000-4000-8000-000000000123",
          productName: "엘리쉬",
          score: 0.91,
          sortOrder: 3,
        },
      ],
    },
    "Asset Curator": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      assets: [
        {
          productId: "00000000-0000-4000-8000-000000000121",
          assetVersionId: "00000000-0000-4000-8000-00000000012a",
          reason: "대표 이미지·라이선스 유효",
        },
        {
          productId: "00000000-0000-4000-8000-000000000122",
          assetVersionId: "00000000-0000-4000-8000-00000000012b",
          reason: "대표 이미지·라이선스 유효",
        },
        {
          productId: "00000000-0000-4000-8000-000000000123",
          assetVersionId: "00000000-0000-4000-8000-00000000012c",
          reason: "대표 이미지·라이선스 유효",
        },
      ],
    },
    "Copy Generator": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      copies: [
        {
          productId: "00000000-0000-4000-8000-000000000121",
          headline: "가을의 쉼, 카르마",
          body: "자코모가 제안하는 편안한 계절",
        },
        {
          productId: "00000000-0000-4000-8000-000000000122",
          headline: "일상에 스며드는 플룸",
          body: "가족의 시간을 더 포근하게",
        },
        {
          productId: "00000000-0000-4000-8000-000000000123",
          headline: "엘리쉬로 완성하는 가을",
          body: "오래 머물고 싶은 집",
        },
      ],
    },
    "Layout Planner": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      formatProfileId: "00000000-0000-4000-8000-000000000115",
      width: 1029,
      height: 258,
      placements: [
        {
          id: "00000000-0000-4000-8000-000000000111",
          safeArea: { left: 24, right: 24, top: 16, bottom: 16 },
        },
      ],
    },
    "Natural Language Editor": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      operations: [{ op: "replaceText", elementId: "headline", value: "가을의 쉼, 카르마" }],
      rationale: "브랜드 톤을 유지하면서 가을 시즌 메시지를 선명하게 합니다.",
    },
    "AI Policy Reviewer": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      findings: [
        {
          code: "COPY_CLAIM_REVIEW",
          severity: "INFO",
          status: "NOT_APPLICABLE",
          message: "과장 표현 없음",
        },
      ],
      errorCount: 0,
    },
    "Export Assistant": {
      campaignId: "00000000-0000-4000-8000-00000000010b",
      filename: "JACOMO-2026-FALL-KARMA-V01.png",
      relativePath: "JACOMO-2026-FALL-KARMA-V01.png",
      mimeType: "image/png",
      width: 1029,
      height: 258,
    },
  });

export function jacomoAgentResponse(agent: JacomoAgentName): Record<string, unknown> {
  return structuredClone(JACOMO_AGENT_RESPONSES[agent]);
}

export function isJacomoAgentName(value: unknown): value is JacomoAgentName {
  return typeof value === "string" && (JACOMO_AGENT_NAMES as readonly string[]).includes(value);
}
