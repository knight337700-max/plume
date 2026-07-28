import { describe, expect, it } from "vitest";

import { agentSchemaCount, agentSchemaFilenames, agentSchemas } from "./index.js";

describe("agent schema bundle", () => {
  it("contains the 23 registered schemas", () => {
    expect(agentSchemaCount).toBe(23);
    expect(agentSchemaFilenames).toHaveLength(23);
    expect(Object.keys(agentSchemas)).toHaveLength(23);
  });

  it("contains only schemas with local references", () => {
    for (const schema of Object.values(agentSchemas)) {
      expect(schema).toBeTypeOf("object");
    }
  });
});
