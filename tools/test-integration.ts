import { spawnSync } from "node:child_process";

const filterIndex = process.argv.indexOf("--filter");
const filter = filterIndex >= 0 ? process.argv[filterIndex + 1] : "core-workflow";
if (filter !== "core-workflow") {
  console.error(`Unknown integration filter: ${filter ?? ""}`);
  process.exitCode = 1;
} else {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    command,
    [
      "exec",
      "vitest",
      "run",
      "--workspace",
      "vitest.workspace.ts",
      "packages/testkit/src/core-workflow.integration.test.ts",
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.error) console.error(result.error);
  process.exitCode = result.status ?? 1;
}
