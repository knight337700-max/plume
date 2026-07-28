import { createHash } from "node:crypto";
import { probeCanvas, type CanvasCandidateProbe } from "./canvas.js";
import { probeSvgSharp, type RendererCandidateProbe } from "./svg-sharp.js";

export interface NativeRasterCandidate {
  readonly technology: "native-deterministic-raster";
  readonly available: true;
  readonly dependencies: readonly [];
  readonly evidence: string;
}

export interface RendererSpikeReport {
  readonly selectedTechnology: "native-deterministic-raster";
  readonly candidates: readonly (
    | RendererCandidateProbe
    | CanvasCandidateProbe
    | NativeRasterCandidate
  )[];
  readonly decision: string;
  readonly probeChecksum: string;
}

const nativeRaster: NativeRasterCandidate = {
  technology: "native-deterministic-raster",
  available: true,
  dependencies: [],
  evidence:
    "Node built-ins are available in the locked worker runtime; PNG encoding and deterministic element compositing are implemented without optional native modules",
};

export function runRendererTechnologySpike(): RendererSpikeReport {
  const candidates = [probeSvgSharp(), probeCanvas(), nativeRaster] as const;
  const probeChecksum = createHash("sha256")
    .update(JSON.stringify({ rendererVersion: "native-deterministic-raster-v1", candidates }))
    .digest("hex");
  return {
    selectedTechnology: "native-deterministic-raster",
    candidates,
    decision:
      "Select native-deterministic-raster for the MVP; SVG+Sharp and Canvas remain optional follow-up adapters until their dependencies and worker smoke tests are present.",
    probeChecksum,
  };
}
