import { createRequire } from "node:module";

export interface CanvasCandidateProbe {
  readonly technology: "canvas";
  readonly available: boolean;
  readonly dependency: "canvas";
  readonly evidence: string;
}

export function probeCanvas(): CanvasCandidateProbe {
  const require = createRequire(import.meta.url);
  try {
    require.resolve("canvas");
    return {
      technology: "canvas",
      available: true,
      dependency: "canvas",
      evidence: "canvas is resolvable in the worker runtime",
    };
  } catch {
    return {
      technology: "canvas",
      available: false,
      dependency: "canvas",
      evidence: "canvas is not declared or resolvable; no native Canvas smoke test can run",
    };
  }
}
