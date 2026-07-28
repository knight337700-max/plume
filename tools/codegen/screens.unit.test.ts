import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseScreenContracts } from "./screens.js";

const source = readFileSync(
  new URL("../../contracts-source/screen-data-contracts.yaml", import.meta.url),
  "utf8",
);

describe("screen contract generator", () => {
  it("generates the 29 design screens", () => {
    const screens = parseScreenContracts(source);

    expect(screens).toHaveLength(29);
    expect(new Set(screens.map(({ route }) => route)).size).toBe(29);
  });

  it("rejects duplicate routes", () => {
    const duplicateRoutes = Array.from(
      { length: 29 },
      (_, index) => `- id: SCREEN-${index}\n  route: /screen-${index === 28 ? 0 : index}`,
    ).join("\n");

    expect(() => parseScreenContracts(duplicateRoutes)).toThrow("routes must be unique");
  });
});
