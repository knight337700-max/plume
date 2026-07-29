import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client.js";

export type AutosaveState = "saved" | "saving" | "unsaved" | "conflict" | "error";

export interface AutosaveSaveResult {
  readonly revision: string | number;
}

export type AutosaveSaveFunction<T> = (
  value: T,
  ifMatch: string | number | undefined,
) => Promise<AutosaveSaveResult>;

export interface AutosaveSnapshot {
  readonly state: AutosaveState;
  readonly revision?: string | number;
  readonly error?: string;
  readonly retry: () => Promise<void>;
  readonly reload: () => void;
}

export interface UseAutosaveOptions<T> {
  value: T;
  revision?: string | number;
  dirty?: boolean;
  enabled?: boolean;
  debounceMs?: number;
  save: AutosaveSaveFunction<T>;
  onReload?: () => void;
}

export interface AutosaveFailure {
  readonly state: "conflict" | "error";
  readonly message: string;
}

export function classifyAutosaveError(error: unknown): AutosaveFailure {
  if (error instanceof ApiError && error.problem.status === 409) {
    return {
      state: "conflict",
      message: "This version changed elsewhere. Reload the latest version before saving again.",
    };
  }
  return {
    state: "error",
    message: error instanceof Error ? error.message : "Autosave failed. Try again.",
  };
}

export function useAutosave<T>({
  value,
  revision: initialRevision,
  dirty = false,
  enabled = true,
  debounceMs = 400,
  save,
  onReload,
}: UseAutosaveOptions<T>): AutosaveSnapshot {
  const latestValue = useRef(value);
  const latestRevision = useRef<string | number | undefined>(initialRevision);
  const [state, setState] = useState<AutosaveState>(dirty ? "unsaved" : "saved");
  const [revision, setRevision] = useState<string | number | undefined>(initialRevision);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    latestValue.current = value;
    latestRevision.current = initialRevision;
  }, [initialRevision, value]);

  const saveNow = useCallback(async () => {
    setState("saving");
    setError(undefined);
    try {
      const result = await save(latestValue.current, latestRevision.current);
      latestRevision.current = result.revision;
      setRevision(result.revision);
      setState("saved");
    } catch (saveError) {
      const failure = classifyAutosaveError(saveError);
      setState(failure.state);
      setError(failure.message);
    }
  }, [save]);

  useEffect(() => {
    if (!enabled || !dirty) return undefined;
    setState((current) => (current === "saving" ? current : "unsaved"));
    const timer = setTimeout(() => void saveNow(), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, dirty, enabled, saveNow, value]);

  const retry = useCallback(() => saveNow(), [saveNow]);
  const reload = useCallback(() => {
    onReload?.();
    setError(undefined);
    setState("saved");
  }, [onReload]);

  const snapshot = {
    state,
    retry,
    reload,
    ...(revision !== undefined ? { revision } : {}),
  };
  return error ? { ...snapshot, error } : snapshot;
}
