import { apiClient } from "../../api/client.js";

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface AdvertiserSummary { readonly id: string; readonly name: string; readonly brandCount: number }
export interface BrandSummary { readonly id: string; readonly name: string; readonly advertiserId: string; readonly productCount: number }
export interface CampaignSummary { readonly id: string; readonly name: string; readonly status: string; readonly currentStep: string }

export function listAdvertisers(workspaceId: string, cursor?: string, client = apiClient) {
  return client.get<{ readonly data: CursorPage<AdvertiserSummary> }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/advertisers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  ).then((response) => response.data);
}

export function getBrand(workspaceId: string, brandId: string, client = apiClient) {
  return client.get<{ readonly data: BrandSummary }>(`/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`).then((response) => response.data);
}

export function listCampaigns(workspaceId: string, cursor?: string, client = apiClient) {
  return client.get<{ readonly data: CursorPage<CampaignSummary> }>(
    `/workspaces/${encodeURIComponent(workspaceId)}/campaigns${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  ).then((response) => response.data);
}
