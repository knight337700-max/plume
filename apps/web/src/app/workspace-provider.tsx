import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, type ApiError } from "../api/client.js";

export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER";
export type WorkspaceRecordStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: WorkspaceRecordStatus;
  readonly revisionNo: number;
}

export type WorkspaceLoadStatus = "idle" | "loading" | "ready" | "not-found" | "no-access" | "error";

export interface WorkspaceClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
}

interface WorkspaceResponse {
  readonly data: WorkspaceRecord & {
    readonly role?: WorkspaceRole;
    readonly membership?: { readonly roleCode?: WorkspaceRole; readonly role?: WorkspaceRole };
  };
}

export interface WorkspaceContextValue {
  readonly workspaceId: string | undefined;
  readonly workspace: WorkspaceRecord | null;
  readonly role: WorkspaceRole | undefined;
  readonly status: WorkspaceLoadStatus;
  readonly error: unknown;
  refresh(): Promise<void>;
}

export interface WorkspaceProviderProps {
  children: ReactNode;
  workspaceId?: string;
  client?: WorkspaceClient;
  initialWorkspace?: WorkspaceRecord | null;
  initialRole?: WorkspaceRole;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function isStatusError(error: unknown, status: number) {
  return error instanceof Error && "problem" in error && (error as ApiError).problem.status === status;
}

function roleFromPayload(payload: WorkspaceResponse["data"]) {
  return payload.role ?? payload.membership?.roleCode ?? payload.membership?.role;
}

export function WorkspaceProvider({
  children,
  workspaceId,
  client = apiClient,
  initialWorkspace,
  initialRole,
}: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<WorkspaceRecord | null>(initialWorkspace ?? null);
  const [role, setRole] = useState<WorkspaceRole | undefined>(initialRole);
  const [status, setStatus] = useState<WorkspaceLoadStatus>(
    workspaceId === undefined
      ? "idle"
      : initialWorkspace === undefined
        ? "loading"
        : initialWorkspace === null
          ? "not-found"
          : "ready",
  );
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setWorkspace(null);
      setRole(undefined);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const response = await client.get<WorkspaceResponse>(`/workspaces/${encodeURIComponent(workspaceId)}`);
      setWorkspace(response.data);
      setRole(roleFromPayload(response.data) ?? initialRole);
      setStatus("ready");
    } catch (nextError) {
      setWorkspace(null);
      setRole(undefined);
      setError(nextError);
      setStatus(isStatusError(nextError, 404) ? "not-found" : isStatusError(nextError, 403) ? "no-access" : "error");
    }
  }, [client, initialRole, workspaceId]);

  useEffect(() => {
    if (workspaceId === undefined) {
      if (initialWorkspace === undefined) void refresh();
      return;
    }
    if (initialWorkspace === undefined || initialWorkspace?.id !== workspaceId) void refresh();
  }, [initialWorkspace, refresh, workspaceId]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ workspaceId, workspace, role, status, error, refresh }),
    [error, refresh, role, status, workspace, workspaceId],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return value;
}
