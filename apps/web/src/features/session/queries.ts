import { apiClient, type ApiError } from "../../api/client.js";
import type { AuthSession } from "../../app/auth-provider.js";
import type { WorkspaceRecord } from "../../app/workspace-provider.js";

export interface SessionEnvelope { readonly data: AuthSession }
export interface WorkspaceListEnvelope { readonly data: readonly WorkspaceRecord[] }

export async function getCurrentSession(client = apiClient) {
  try {
    return (await client.get<SessionEnvelope>("/auth/session")).data;
  } catch (error) {
    if (error instanceof Error && "problem" in error && (error as ApiError).problem.status === 401) return null;
    throw error;
  }
}

export async function listAccessibleWorkspaces(client = apiClient) {
  return (await client.get<WorkspaceListEnvelope>("/workspaces")).data;
}
