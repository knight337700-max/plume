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
        "packages/infrastructure/src/**/*.test.ts",
        "packages/observability/src/**/*.test.ts",
        "apps/api/src/**/*.test.ts",
        "apps/worker/src/**/*.test.ts",
      ],
      exclude: ["**/node_modules/**", "**/dist/**"],
      passWithNoTests: false,
    },
  },
  {
    test: {
      name: "gate-g-api-e2e",
      include: ["apps/api/e2e/jacomo-flow.spec.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      passWithNoTests: false,
    },
  },
]);
