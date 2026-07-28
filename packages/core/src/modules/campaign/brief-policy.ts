import type { CampaignBriefVersionRecord } from "./repositories.js";

export function assertBriefVersionCanConfirm(version: CampaignBriefVersionRecord): void {
  if (version.status === "INVALIDATED") { const error = new Error("Invalidated brief versions cannot be confirmed"); Object.assign(error, { code: "BRIEF_VERSION_INVALIDATED", statusCode: 409 }); throw error; }
}

export function downstreamStaleAfterConfirmation(wasAlreadyConfirmed: boolean): { readonly matching: boolean; readonly recommendations: boolean; readonly generation: boolean } {
  return { matching: !wasAlreadyConfirmed, recommendations: !wasAlreadyConfirmed, generation: !wasAlreadyConfirmed };
}
