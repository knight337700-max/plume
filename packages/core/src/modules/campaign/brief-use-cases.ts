import type { CampaignBriefVersionRecord, CampaignRepositories } from "./repositories.js";
import { assertBriefVersionCanConfirm, downstreamStaleAfterConfirmation } from "./brief-policy.js";

export interface CreateBriefVersionInput { readonly workspaceId: string; readonly campaignBriefId: string; readonly parentVersionId?: string; readonly sourceKind: string; readonly contentJson: Readonly<Record<string, unknown>>; readonly sourceCitationsJson?: readonly unknown[]; readonly brandProfileSnapshotJson?: Readonly<Record<string, unknown>>; readonly createdBy?: string }
export interface BriefConfirmationResult { readonly version: CampaignBriefVersionRecord; readonly staleDownstream: { readonly matching: boolean; readonly recommendations: boolean; readonly generation: boolean } }
export interface BriefUseCases { get(workspaceId: string, campaignId: string): Promise<{ readonly version?: CampaignBriefVersionRecord }>; createVersion(input: CreateBriefVersionInput): Promise<CampaignBriefVersionRecord>; confirm(workspaceId: string, versionId: string): Promise<BriefConfirmationResult> }

export function createBriefUseCases(repositories: CampaignRepositories): BriefUseCases {
  return {
    async get(workspaceId, campaignId) { const brief = await repositories.getBrief(workspaceId, campaignId); if (!brief?.currentVersionId) return {}; const version = await repositories.getBriefVersion(workspaceId, brief.currentVersionId); return version ? { version } : {}; },
    createVersion: (input) => repositories.createBriefVersion({ ...input, sourceCitationsJson: input.sourceCitationsJson ?? [], brandProfileSnapshotJson: input.brandProfileSnapshotJson ?? {} }),
    async confirm(workspaceId, versionId) { const current = await repositories.getBriefVersion(workspaceId, versionId); if (!current) { const error = new Error("Brief version not found"); Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 }); throw error; } assertBriefVersionCanConfirm(current); const version = await repositories.confirmBriefVersion(workspaceId, versionId); return { version, staleDownstream: downstreamStaleAfterConfirmation(current.status === "CONFIRMED") }; },
  };
}
