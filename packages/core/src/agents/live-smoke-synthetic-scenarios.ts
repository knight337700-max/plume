import {
  APPROVED_FORMAT_PROFILES,
  CANONICAL_CHANNELS,
  type ApprovedFormatDefinition,
} from "../modules/media-catalog/canonical-catalog.js";

export const LIVE_SMOKE_SYNTHETIC_SCENARIO_ID = "SYNTHETIC_JACOMO_KAKAO_BIZBOARD_2026_1" as const;
export type LiveSmokeSyntheticScenarioId = typeof LIVE_SMOKE_SYNTHETIC_SCENARIO_ID;

type ScenarioMessage = Readonly<{
  readonly role: "system" | "user";
  readonly content: string;
}>;

export interface ApprovedLiveSmokeSyntheticScenario {
  readonly id: LiveSmokeSyntheticScenarioId;
  readonly workspaceLabel: "SYNTHETIC_JACOMO";
  readonly brand: "JACOMO";
  readonly market: "KR";
  readonly locale: "ko-KR";
  readonly channel: Readonly<{ readonly code: "KAKAO_MOMENT"; readonly label: string }>;
  readonly product: Readonly<{ readonly code: "BIZBOARD"; readonly name: string }>;
  readonly formatProfile: Readonly<Record<string, unknown>>;
  readonly agentData: Readonly<Record<string, unknown>>;
  readonly messages: readonly ScenarioMessage[];
  readonly layoutMessages: readonly ScenarioMessage[];
  readonly canaryMessages: readonly ScenarioMessage[];
  readonly scopeAttestation: Readonly<Record<string, unknown>>;
}

const EXPECTED_FORMAT = Object.freeze({
  id: "kakao-moment-bizboard-1029x258",
  channelCode: "KAKAO_MOMENT",
  productCode: "BIZBOARD",
  stableKey: "kakao-moment-bizboard-1029x258",
  version: "2026.1",
  specificationVersion: "2026.1",
  status: "ACTIVE",
  mediaType: "PNG",
  renderMode: "SERVER_RENDER",
  width: 1029,
  height: 258,
  ruleSetId: "kakao-moment-2026.1",
  exportRecipeId: "kakao-moment-bizboard",
});

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function catalogDrift(): never {
  throw new Error("LIVE_SMOKE_SYNTHETIC_SCENARIO_CATALOG_DRIFT");
}

function assertCanonicalFormat(profile: ApprovedFormatDefinition): void {
  const width = Number(profile.spec.width);
  const height = Number(profile.spec.height);
  if (
    profile.id !== EXPECTED_FORMAT.id ||
    profile.channelCode !== EXPECTED_FORMAT.channelCode ||
    profile.productCode !== EXPECTED_FORMAT.productCode ||
    profile.stableKey !== EXPECTED_FORMAT.stableKey ||
    profile.version !== EXPECTED_FORMAT.version ||
    profile.specificationVersion !== EXPECTED_FORMAT.specificationVersion ||
    profile.status !== EXPECTED_FORMAT.status ||
    profile.mediaType !== EXPECTED_FORMAT.mediaType ||
    profile.renderMode !== EXPECTED_FORMAT.renderMode ||
    width !== EXPECTED_FORMAT.width ||
    height !== EXPECTED_FORMAT.height ||
    profile.ruleSetId !== EXPECTED_FORMAT.ruleSetId ||
    profile.exportRecipeId !== EXPECTED_FORMAT.exportRecipeId
  )
    catalogDrift();
}

function scenarioFromCatalog(
  scenarioId: string,
  catalog: readonly ApprovedFormatDefinition[],
): ApprovedLiveSmokeSyntheticScenario {
  if (scenarioId !== LIVE_SMOKE_SYNTHETIC_SCENARIO_ID)
    throw new Error("LIVE_SMOKE_SYNTHETIC_SCENARIO_NOT_APPROVED");
  const profile = catalog.find((candidate) => candidate.id === EXPECTED_FORMAT.id);
  if (!profile) catalogDrift();
  assertCanonicalFormat(profile);
  const channel = CANONICAL_CHANNELS.find((candidate) => candidate.id === profile.channelCode);
  if (!channel || channel.id !== "KAKAO_MOMENT" || profile.productName !== "Bizboard")
    catalogDrift();

  const formatProfile = {
    id: profile.id,
    stableKey: profile.stableKey,
    version: profile.version,
    specificationVersion: profile.specificationVersion,
    width: Number(profile.spec.width),
    height: Number(profile.spec.height),
    mediaType: profile.mediaType,
    renderMode: profile.renderMode,
    ruleSetId: profile.ruleSetId,
    exportRecipeId: profile.exportRecipeId,
    spec: profile.spec,
  } as const;
  const channelContext = { code: channel.id, label: channel.label } as const;
  const productContext = {
    code: profile.productCode as "BIZBOARD",
    name: profile.productName,
  } as const;
  const sourceText =
    "Synthetic JACOMO Autumn Sofa Preview for Kakao Moment Bizboard; no customer data, images, or external URLs.";
  const campaignId = "00000000-0000-4000-8000-0000000002c1";
  const productId = "00000000-0000-4000-8000-0000000002c2";
  const creativeId = "00000000-0000-4000-8000-0000000002c5";
  const agentData = {
    syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
    sourceIds: ["00000000-0000-4000-8000-0000000002c6"],
    sourceText,
    citations: [],
    brandProfile: { brand: "JACOMO", market: "KR", synthetic: true },
    productNames: ["Synthetic Autumn Sofa"],
    candidates: [],
    products: [{ id: productId, name: "Synthetic Autumn Sofa" }],
    product: { id: productId, name: "Synthetic Autumn Sofa" },
    channel: channelContext,
    formatProfile,
    brief: {
      campaign: "Synthetic Autumn Sofa Preview",
      objective: "Generate validation-safe Kakao Moment Bizboard metadata",
    },
    assets: [],
    textSlots: [
      { id: "headline", maxCharacters: 40 },
      { id: "body", maxCharacters: 80 },
    ],
    copy: { headline: "Synthetic autumn comfort" },
    template: { id: "synthetic-kakao-bizboard", safeZone: true },
    safeZones: [],
    creativeDocument: { schemaVersion: "1.0.0", metadata: { campaignId } },
    editRequest: "Move the synthetic headline slightly lower.",
    validation: [],
    render: { mimeType: "image/png", width: 1029, height: 258, synthetic: true },
    rules: { ruleSetId: profile.ruleSetId, specificationVersion: profile.specificationVersion },
    landingSnapshot: null,
    campaign: { id: campaignId, name: "Synthetic Autumn Sofa Preview" },
    creative: { id: creativeId, synthetic: true },
    exportRecipe: { id: profile.exportRecipeId, packageType: "ZIP", synthetic: true },
  } as const;
  const scopeText =
    "Evaluate the synthetic JACOMO Autumn Sofa Preview workflow for Kakao Moment Bizboard using the repository-approved kakao-moment-bizboard-1029x258 profile version 2026.1. The format is 1029×258 PNG (1029x258). All campaign, product, asset, and creative data is Synthetic.";
  const messages = [
    {
      role: "system" as const,
      content:
        "Controlled local synthetic evaluation only. Return only the registered JSON schema. Do not use tools, external data, customer data, external URLs, or network retrieval.",
    },
    { role: "user" as const, content: scopeText },
  ];
  const layoutMessages = [
    ...messages,
    {
      role: "system" as const,
      content:
        "LAYOUT_PLANNER contract: formatProfileId is derived from the canonical input.formatProfile.id and must not be emitted by the model. Emit the required elements array; an empty array is valid for this synthetic input.",
    },
  ];
  const canaryMessages = [
    messages[0]!,
    {
      role: "user" as const,
      content: `${scopeText} Provider canary: return only the registered status, environment, and provider JSON object.`,
    },
  ];
  return deepFreeze({
    id: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
    workspaceLabel: "SYNTHETIC_JACOMO",
    brand: "JACOMO",
    market: "KR",
    locale: "ko-KR",
    channel: channelContext,
    product: productContext,
    formatProfile,
    agentData,
    messages,
    layoutMessages,
    canaryMessages,
    scopeAttestation: {
      scenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
      workspaceLabel: "SYNTHETIC_JACOMO",
      brand: "JACOMO",
      channelCode: profile.channelCode,
      productCode: profile.productCode,
      formatProfileId: profile.id,
      profileVersion: profile.version,
      dimensions: { width: Number(profile.spec.width), height: Number(profile.spec.height) },
      mediaType: profile.mediaType,
      synthetic: true,
      catalogMatch: true,
    },
  });
}

export function resolveLiveSmokeSyntheticScenarioFromCatalog(
  scenarioId: string,
  catalog: readonly ApprovedFormatDefinition[],
): ApprovedLiveSmokeSyntheticScenario {
  return scenarioFromCatalog(scenarioId, catalog);
}

export function resolveLiveSmokeSyntheticScenario(
  scenarioId: string,
): ApprovedLiveSmokeSyntheticScenario {
  return scenarioFromCatalog(scenarioId, APPROVED_FORMAT_PROFILES);
}

export function isApprovedLiveSmokeSyntheticScenarioId(
  value: unknown,
): value is LiveSmokeSyntheticScenarioId {
  return value === LIVE_SMOKE_SYNTHETIC_SCENARIO_ID;
}
