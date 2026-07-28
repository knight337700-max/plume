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
]);
