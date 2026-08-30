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
  projects: (workspaceId: string, campaignId: string) =>
    [...queryKeys.campaign(workspaceId, campaignId), "projects"] as const,
  project: (workspaceId: string, projectId: string) =>
    [...queryKeys.workspace(workspaceId), "project", projectId] as const,
  projectAssets: (workspaceId: string, projectId: string, effective = false) =>
    [
      ...queryKeys.project(workspaceId, projectId),
      "assets",
      effective ? "effective" : "local",
    ] as const,
  projectCreativeSets: (workspaceId: string, projectId: string) =>
    [...queryKeys.project(workspaceId, projectId), "creative-sets"] as const,
  creativeSet: (workspaceId: string, creativeSetId: string) =>
    [...queryKeys.workspace(workspaceId), "creative-set", creativeSetId] as const,
  creatives: (workspaceId: string, creativeSetId: string) =>
    [...queryKeys.creativeSet(workspaceId, creativeSetId), "creatives"] as const,
  creative: (workspaceId: string, creativeId: string) =>
    [...queryKeys.workspace(workspaceId), "creative", creativeId] as const,
  creativeVersion: (workspaceId: string, versionId: string) =>
    [...queryKeys.workspace(workspaceId), "creative-version", versionId] as const,
  creativeRenders: (workspaceId: string, versionId: string) =>
    [...queryKeys.creativeVersion(workspaceId, versionId), "renders"] as const,
  creativeRenderDownload: (workspaceId: string, versionId: string, renderId: string) =>
    [...queryKeys.creativeRenders(workspaceId, versionId), renderId, "download"] as const,
  campaignAssets: (workspaceId: string, campaignId: string) =>
    [...queryKeys.campaign(workspaceId, campaignId), "assets"] as const,
  channels: (workspaceId: string, campaignId: string) =>
    [...queryKeys.campaign(workspaceId, campaignId), "channels"] as const,
  formatOptions: (workspaceId: string, campaignId: string, channelCode: string) =>
    [...queryKeys.campaign(workspaceId, campaignId), "format-options", channelCode] as const,
} as const;
