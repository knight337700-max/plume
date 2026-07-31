import { describe, expect, it } from "vitest";

import {
  agentSchemaCount,
  API_ERROR_CODE_COUNT,
  openApiOperationCount,
  screenContractCount,
} from "./index.js";

describe("contracts public entrypoint", () => {
  it("exports all Gate A generated contract families", () => {
    expect(openApiOperationCount).toBe(139);
    expect(screenContractCount).toBe(29);
    expect(agentSchemaCount).toBe(23);
    expect(API_ERROR_CODE_COUNT).toBe(39);
  });
});
