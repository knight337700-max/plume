import { apiClient } from "../../api/client.js";

export interface DashboardSummary {
  readonly campaigns: { readonly total: number; readonly recent: number };
  readonly approvals: { readonly pending: number };
  readonly jobs: { readonly running: number; readonly failed: number };
  readonly exports: { readonly completed: number; readonly failed: number };
}

export interface DashboardSummaryEnvelope { readonly data: DashboardSummary }

export function getDashboardSummary(workspaceId: string, client = apiClient) {
  return client
    .get<DashboardSummaryEnvelope>(`/workspaces/${encodeURIComponent(workspaceId)}/dashboard`)
    .then((response) => response.data);
}
