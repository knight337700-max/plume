export const queryKeys = {
  all: ["plume"] as const,
  workspace: (workspaceId: string) => [...queryKeys.all, "workspace", workspaceId] as const,
  advertiser: (workspaceId: string, advertiserId: string) =>
    [...queryKeys.workspace(workspaceId), "advertiser", advertiserId] as const,
  brand: (workspaceId: string, brandId: string) =>
    [...queryKeys.workspace(workspaceId), "brand", brandId] as const,
  campaign: (workspaceId: string, campaignId: string) =>
    [...queryKeys.workspace(workspaceId), "campaign", campaignId] as const,
  campaigns: (workspaceId: string) => [...queryKeys.workspace(workspaceId), "campaigns"] as const,
  jobs: (workspaceId: string) => [...queryKeys.workspace(workspaceId), "jobs"] as const,
  job: (workspaceId: string, jobId: string) => [...queryKeys.jobs(workspaceId), jobId] as const,
} as const;
