import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "testkit",
      include: ["packages/testkit/src/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      passWithNoTests: false,
    },
  },
  {
    test: {
      name: "gate-c-unit-and-contracts",
      include: [
        "packages/core/src/**/*.test.ts",
        "packages/contracts/src/**/*.test.ts",
        "packages/config/src/**/*.test.ts",
        "packages/db/src/**/*.test.ts",
        "packages/infrastructure/src/**/*.test.ts",
        "packages/observability/src/**/*.test.ts",
        "apps/api/src/**/*.test.ts",
        "apps/worker/src/**/*.test.ts",
        "apps/scheduler/src/**/*.test.ts",
        "tools/codegen/**/*.unit.test.ts",
        "tools/integrity/**/*.unit.test.ts",
        "tools/renderer/**/*.unit.test.ts",
      ],
      exclude: ["**/node_modules/**", "**/dist/**"],
      passWithNoTests: false,
    },
  },
  {
    test: {
      name: "gate-g-api-e2e",
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      include: [
        "apps/api/e2e/jacomo-flow.spec.ts",
        "apps/api/e2e/jacomo-canonical-product-flow.spec.ts",
        "apps/api/e2e/jacomo-thumbnail-semantic-product-flow.spec.ts",
      ],
      exclude: ["**/node_modules/**", "**/dist/**"],
      passWithNoTests: false,
    },
  },
]);
