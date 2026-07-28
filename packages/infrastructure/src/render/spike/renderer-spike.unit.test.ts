import { describe, expect, it } from "vitest";
import { runRendererTechnologySpike } from "./renderer-spike.js";

describe("renderer technology spike", () => {
  it("records a deterministic candidate comparison and a usable selected adapter", () => {
    const first = runRendererTechnologySpike();
    const second = runRendererTechnologySpike();
    expect(first.selectedTechnology).toBe("native-deterministic-raster");
    expect(first.probeChecksum).toBe(second.probeChecksum);
    expect(first.candidates).toHaveLength(3);
    expect(
      first.candidates.find((candidate) => candidate.technology === "native-deterministic-raster"),
    ).toMatchObject({ available: true });
  });
});
