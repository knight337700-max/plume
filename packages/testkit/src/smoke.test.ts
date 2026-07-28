import { describe, expect, it } from "vitest";

import { isPlumePackage, testkitPackageName } from "./index.js";

describe("testkit package", () => {
  it("identifies the Plume package namespace", () => {
    expect(testkitPackageName).toBe("@plume/testkit");
    expect(isPlumePackage(testkitPackageName)).toBe(true);
    expect(isPlumePackage("external-package")).toBe(false);
  });
});
