import assert from "node:assert/strict";
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

assert.equal(operationIds.length, 137);
assert.equal(coverage.implemented.length, 1);
assert.equal(coverage.pending.length, 136);
assert.equal(coverage.unclassified.length, 0);

export { coverage };
