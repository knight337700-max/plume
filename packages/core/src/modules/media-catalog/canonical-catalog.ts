export type CanonicalChannelCode = "NAVER_GFA" | "KAKAO_MOMENT" | "META" | "GOOGLE_ADS";

export interface CanonicalChannelDefinition {
  readonly id: CanonicalChannelCode;
  readonly label: string;
  readonly enabled: true;
  readonly sortOrder: number;
}

export interface ApprovedFormatDefinition {
  readonly id: string;
  readonly channelCode: CanonicalChannelCode;
  readonly productCode: string;
  readonly productName: string;
  readonly stableKey: string;
  readonly version: string;
  readonly name: string;
  readonly status: "ACTIVE";
  readonly renderMode: string;
  readonly mediaType: string;
  readonly spec: Readonly<Record<string, unknown>>;
  readonly ruleSetId: string;
  readonly exportRecipeId: string;
  readonly specificationVersion: string;
}

export const CANONICAL_CHANNELS: readonly CanonicalChannelDefinition[] = Object.freeze([
  { id: "NAVER_GFA", label: "Naver GFA", enabled: true, sortOrder: 10 },
  { id: "KAKAO_MOMENT", label: "Kakao Moment", enabled: true, sortOrder: 20 },
  { id: "META", label: "Meta", enabled: true, sortOrder: 30 },
  { id: "GOOGLE_ADS", label: "Google Ads", enabled: true, sortOrder: 40 },
]);

/**
 * Only repository-versioned, verified specifications belong here. The current
 * repository contains the synthetic JACOMO Kakao Moment fixture, but no
 * approved Naver GFA, Meta, or Google Ads format manifest.
 */
export const APPROVED_FORMAT_PROFILES: readonly ApprovedFormatDefinition[] = Object.freeze([
  {
    id: "kakao-moment-bizboard-1029x258",
    channelCode: "KAKAO_MOMENT",
    productCode: "BIZBOARD",
    productName: "Bizboard",
    stableKey: "kakao-moment-bizboard-1029x258",
    version: "2026.1",
    name: "Kakao Moment Bizboard 1029x258",
    status: "ACTIVE",
    renderMode: "SERVER_RENDER",
    mediaType: "PNG",
    spec: { width: 1029, height: 258, maxBytes: 307200, alpha: true, colorMode: "RGBA" },
    ruleSetId: "kakao-moment-2026.1",
    exportRecipeId: "kakao-moment-bizboard",
    specificationVersion: "2026.1",
  },
]);

export function isCanonicalChannelCode(value: unknown): value is CanonicalChannelCode {
  return typeof value === "string" && CANONICAL_CHANNELS.some((channel) => channel.id === value);
}

export function formatsForCanonicalChannel(
  channelCode: CanonicalChannelCode,
): readonly ApprovedFormatDefinition[] {
  return APPROVED_FORMAT_PROFILES.filter((profile) => profile.channelCode === channelCode);
}
