import { createRequire } from "node:module";

export interface RendererCandidateProbe {
  readonly technology: "svg-sharp";
  readonly available: boolean;
  readonly dependency: "sharp";
  readonly evidence: string;
}

export function probeSvgSharp(): RendererCandidateProbe {
  const require = createRequire(import.meta.url);
  try {
    require.resolve("sharp");
    return {
      technology: "svg-sharp",
      available: true,
      dependency: "sharp",
      evidence: "sharp is resolvable in the worker runtime",
    };
  } catch {
    return {
      technology: "svg-sharp",
      available: false,
      dependency: "sharp",
      evidence: "sharp is not declared or resolvable; no native SVG raster smoke test can run",
    };
  }
}
