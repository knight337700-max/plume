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

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface AuthSession {
  readonly id: string;
  readonly user: AuthUser;
  readonly expiresAt: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthClient {
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body: unknown, init?: RequestInit): Promise<T>;
}

interface AuthResponse {
  readonly data: AuthSession;
}

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: AuthSession | null;
  readonly error: unknown;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

export interface AuthProviderProps {
  children: ReactNode;
  client?: AuthClient;
  initialSession?: AuthSession | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isUnauthorized(error: unknown) {
  return error instanceof Error && "problem" in error && (error as ApiError).problem.status === 401;
}

export function AuthProvider({ children, client = apiClient, initialSession }: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(initialSession ?? null);
  const [status, setStatus] = useState<AuthStatus>(
    initialSession === undefined
      ? "loading"
      : initialSession === null
        ? "unauthenticated"
        : "authenticated",
  );
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await client.get<AuthResponse>("/auth/session");
      setSession(response.data);
      setStatus("authenticated");
    } catch (nextError) {
      setSession(null);
      setError(nextError);
      setStatus(isUnauthorized(nextError) ? "unauthenticated" : "error");
    }
  }, [client]);

  useEffect(() => {
    if (initialSession === undefined) void refresh();
  }, [initialSession, refresh]);

  const signOut = useCallback(async () => {
    await client.post<void>("/auth/logout", {});
    setSession(null);
    setStatus("unauthenticated");
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, error, refresh, signOut }),
    [error, refresh, session, signOut, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
