import { describe, expect, it } from "vitest";
import { AGENT_CODES } from "./prompt-registry.js";
import { buildAgentContext } from "./context-builder.js";
import {
  LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
  resolveLiveSmokeSyntheticScenario,
  resolveLiveSmokeSyntheticScenarioFromCatalog,
} from "./live-smoke-synthetic-scenarios.js";
import { APPROVED_FORMAT_PROFILES } from "../modules/media-catalog/canonical-catalog.js";

const requiredKeys = [
  "sourceIds",
  "sourceText",
  "citations",
  "brandProfile",
  "productNames",
  "candidates",
  "products",
  "product",
  "channel",
  "formatProfile",
  "brief",
  "assets",
  "textSlots",
  "copy",
  "template",
  "safeZones",
  "creativeDocument",
  "editRequest",
  "validation",
  "render",
  "rules",
  "landingSnapshot",
  "campaign",
  "creative",
  "exportRecipe",
] as const;

describe("approved Kakao synthetic live smoke scenario", () => {
  it("resolves exact Catalog scope and supplies every Agent context key", () => {
    const scenario = resolveLiveSmokeSyntheticScenario(LIVE_SMOKE_SYNTHETIC_SCENARIO_ID);
    expect(scenario.id).toBe(LIVE_SMOKE_SYNTHETIC_SCENARIO_ID);
    expect(scenario.channel.code).toBe("KAKAO_MOMENT");
    expect(scenario.product.code).toBe("BIZBOARD");
    expect(scenario.formatProfile).toMatchObject({
      id: "kakao-moment-bizboard-1029x258",
      stableKey: "kakao-moment-bizboard-1029x258",
      version: "2026.1",
      specificationVersion: "2026.1",
      width: 1029,
      height: 258,
      mediaType: "PNG",
      ruleSetId: "kakao-moment-2026.1",
      exportRecipeId: "kakao-moment-bizboard",
    });
    expect(scenario.messages.some((message) => message.content.includes("Naver GFA"))).toBe(false);
    expect(scenario.messages.map((message) => message.content).join(" ")).toContain("Synthetic");
    expect(Object.keys(scenario.agentData).sort()).toEqual(
      expect.arrayContaining([...requiredKeys]),
    );
    expect(scenario.agentData.textSlots).toBeDefined();

    for (const agentCode of AGENT_CODES) {
      const context = buildAgentContext({
        agentCode,
        workspaceId: "00000000-0000-4000-8000-0000000002c0",
        subjectType: "CAMPAIGN",
        subjectId: "00000000-0000-4000-8000-0000000002c1",
        data: scenario.agentData,
      });
      if (
        ["ASSET_CURATOR", "LAYOUT_PLANNER", "AI_POLICY_REVIEWER", "EXPORT_ASSISTANT"].includes(
          agentCode,
        )
      )
        expect(context.data.channel).toEqual(scenario.agentData.channel);
      if (
        ["ASSET_CURATOR", "LAYOUT_PLANNER", "AI_POLICY_REVIEWER", "EXPORT_ASSISTANT"].includes(
          agentCode,
        )
      )
        expect(context.data.formatProfile).toEqual(scenario.agentData.formatProfile);
    }
  });

  it("rejects unknown scenarios and Catalog drift", () => {
    expect(() => resolveLiveSmokeSyntheticScenario("SYNTHETIC_JACOMO_NAVER_GFA_2026_1")).toThrow(
      "LIVE_SMOKE_SYNTHETIC_SCENARIO_NOT_APPROVED",
    );
    const drifted = APPROVED_FORMAT_PROFILES.map((profile) =>
      profile.id === "kakao-moment-bizboard-1029x258"
        ? { ...profile, spec: { ...profile.spec, width: 1028 } }
        : profile,
    );
    expect(() =>
      resolveLiveSmokeSyntheticScenarioFromCatalog(LIVE_SMOKE_SYNTHETIC_SCENARIO_ID, drifted),
    ).toThrow("LIVE_SMOKE_SYNTHETIC_SCENARIO_CATALOG_DRIFT");
  });
});
