import { useCallback, useState } from "react";

export interface ElementHighlight {
  readonly issueId: string;
  readonly elementId: string;
  readonly reason?: string;
}

export interface ElementHighlightTarget {
  readonly issueId: string;
  readonly elementId?: string;
  readonly reason?: string;
}

export function createElementHighlight(
  target: ElementHighlightTarget,
): ElementHighlight | undefined {
  if (!target.elementId) return undefined;
  return {
    issueId: target.issueId,
    elementId: target.elementId,
    ...(target.reason ? { reason: target.reason } : {}),
  };
}

export function useElementHighlight(initial?: ElementHighlight) {
  const [highlight, setHighlight] = useState<ElementHighlight | undefined>(initial);
  const highlightElement = useCallback((target: ElementHighlightTarget) => {
    setHighlight(createElementHighlight(target));
  }, []);
  const clearHighlight = useCallback(() => setHighlight(undefined), []);
  return { highlight, highlightElement, clearHighlight };
}
