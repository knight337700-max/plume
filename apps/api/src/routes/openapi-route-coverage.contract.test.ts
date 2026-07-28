import { describe, expect, it } from "vitest";
import {
  compareRouteCoverage,
  type RegisteredRoute,
} from "../../../../tools/integrity/list-fastify-routes.js";

const operationIds = Array.from({ length: 137 }, (_, index) =>
  index === 0 ? "getHealth" : `pendingOperation${index}`,
);
const registered: readonly RegisteredRoute[] = [
  { operationId: "getHealth", method: "GET", path: "/api/v1/health" },
];
const coverage = compareRouteCoverage(operationIds, registered);

describe("OpenAPI route coverage", () => {
  it("classifies the initial foundation route and intentional pending operations", () => {
    expect(operationIds).toHaveLength(137);
    expect(coverage.implemented).toHaveLength(1);
    expect(coverage.pending).toHaveLength(136);
    expect(coverage.unclassified).toHaveLength(0);
  });
});

export { coverage };
