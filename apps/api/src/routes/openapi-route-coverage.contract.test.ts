import { describe, expect, it } from "vitest";
import {
  compareRouteCoverage,
  readOpenApiOperationIds,
  readRegisteredRoutes,
} from "../../../../tools/integrity/list-fastify-routes.js";

const operationIds = await readOpenApiOperationIds();
const registered = await readRegisteredRoutes();
const coverage = compareRouteCoverage(operationIds, registered);

describe("OpenAPI route coverage", () => {
  it("classifies implemented routes and intentional pending operations", () => {
    expect(operationIds).toHaveLength(137);
    expect(coverage.implemented).toHaveLength(107);
    expect(coverage.pending).toHaveLength(30);
    expect(coverage.unclassified).toHaveLength(0);
  });
});

export { coverage };
