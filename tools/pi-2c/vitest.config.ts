import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tools/pi-2c/run-real-image-semantic-e2e.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
