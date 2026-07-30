import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dirname, "..", "..");
const isWindows = process.platform === "win32";
const packageManager = isWindows ? "pnpm.cmd" : "pnpm";

interface CommandSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly shell?: boolean;
}

interface CommandResult {
  readonly status: number;
  readonly output: string;
}

const redact = (value: string): string =>
  value
    .replace(
      /((?:OPENAI_API_KEY|S3_SECRET_ACCESS_KEY|SESSION_SECRET|DATABASE_URL|TEST_DATABASE_URL|REDIS_URL)\s*[=:]\s*)[^\s"'`]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/(postgres(?:ql)?:\/\/[^\s/:]+:)[^\s@]+(@)/gi, "$1[REDACTED]$2")
    .replace(/(-----BEGIN [A-Z ]+-----)[\s\S]*?(-----END [A-Z ]+-----)/g, "$1[REDACTED]$2");

const pnpm = (name: string, ...args: string[]): CommandSpec => ({
  name,
  command: packageManager,
  args,
  shell: isWindows,
});

const canonicalVisualRegression = (): CommandSpec => {
  if (!isWindows) return pnpm("Visual regression", "e2e:visual");

  return {
    name: "Visual regression (canonical Linux)",
    command: "docker",
    args: [
      "run",
      "--rm",
      "--ipc=host",
      "--env",
      "CI=true",
      "--env",
      "TZ=UTC",
      "--env",
      "LANG=C.UTF-8",
      "--env",
      "LC_ALL=C.UTF-8",
      "--volume",
      `${repositoryRoot.replaceAll("\\", "/")}:/source:ro`,
      "--workdir",
      "/work",
      "mcr.microsoft.com/playwright:v1.55.0-noble",
      "bash",
      "-lc",
      "mkdir -p /work && tar --exclude=./node_modules --exclude=./.git -cf - -C /source . | tar -xf - -C /work && curl --fail --silent --show-error --location https://nodejs.org/dist/v24.15.0/node-v24.15.0-linux-x64.tar.gz --output /tmp/node.tar.gz && tar -xzf /tmp/node.tar.gz -C /tmp && export PATH=/tmp/node-v24.15.0-linux-x64/bin:$PATH && node --version && corepack enable && corepack prepare pnpm@11.17.0 --activate && pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter @plume/ui build && pnpm e2e:visual",
    ],
  };
};

const commands: readonly CommandSpec[] = [
  pnpm("Frozen install", "install", "--frozen-lockfile", "--ignore-scripts"),
  pnpm("Build UI package", "--filter", "@plume/ui", "build"),
  pnpm("Contract manifest and codegen drift", "contracts:check"),
  pnpm("Lint", "lint"),
  pnpm("Typecheck", "typecheck"),
  pnpm("Unit and regression tests", "test"),
  pnpm("Database migration", "db:migrate:test"),
  pnpm("API contract tests", "--filter", "@plume/api", "test:contracts"),
  pnpm("Integration tests", "test:integration", "--filter", "core-workflow"),
  pnpm(
    "Agent mock contract",
    "exec",
    "vitest",
    "run",
    "--workspace",
    "vitest.workspace.ts",
    "packages/testkit/src/ai/mock-openai-server.contract.test.ts",
  ),
  pnpm(
    "Renderer golden tests",
    "exec",
    "vitest",
    "run",
    "--workspace",
    "vitest.workspace.ts",
    "packages/infrastructure/src/export/build-package.golden.test.ts",
    "packages/infrastructure/src/images/create-thumbnail.golden.test.ts",
  ),
  pnpm("Delivery package tests", "test:delivery"),
  pnpm("SSE tests", "test:sse"),
  pnpm("Web unit tests", "--filter", "@plume/web", "test"),
  pnpm("Web production build", "--filter", "@plume/web", "build"),
  pnpm("Screen contract tests", "screen:contracts"),
  pnpm("Jacomo API E2E", "e2e:api:jacomo"),
  pnpm("Jacomo browser E2E", "e2e:web:jacomo"),
  canonicalVisualRegression(),
  pnpm("Accessibility E2E", "e2e:a11y", "--workers=1"),
  pnpm("Architecture integrity", "integrity"),
  pnpm("Deployment manifest integrity", "deployment:check"),
  {
    name: "Docker web image",
    command: "docker",
    args: ["build", "-f", "infra/docker/web.Dockerfile", "-t", "plume-web:mvp", "."],
  },
  {
    name: "Docker API image",
    command: "docker",
    args: ["build", "-f", "infra/docker/api.Dockerfile", "-t", "plume-api:mvp", "."],
  },
  {
    name: "Docker worker image",
    command: "docker",
    args: ["build", "-f", "infra/docker/worker.Dockerfile", "-t", "plume-worker:mvp", "."],
  },
  {
    name: "Docker scheduler image",
    command: "docker",
    args: ["build", "-f", "infra/docker/scheduler.Dockerfile", "-t", "plume-scheduler:mvp", "."],
  },
  { name: "Git diff check", command: "git", args: ["diff", "--check"] },
  { name: "Working tree check", command: "git", args: ["status", "--porcelain"] },
];

function commandText(spec: CommandSpec): string {
  return [spec.command, ...spec.args].join(" ");
}

function run(command: string, args: readonly string[], shell = false): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, CI: "true", PLUME_AI_MODE: "mock" },
      shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => resolve({ status: 1, output: `${output}\n${error.message}` }));
    child.on("close", (status) => resolve({ status: status ?? 1, output }));
  });
}

function cleanWorkingTree(label: string): void {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: git status exited ${result.status}`);
  if (result.stdout.trim())
    throw new Error(`${label}: working tree is dirty\n${redact(result.stdout)}`);
}

function assertReleaseCheckPolicy(): void {
  if (!existsSync(join(repositoryRoot, "infra", "docker", "web.Dockerfile")))
    throw new Error("production Dockerfiles are missing");
  if (commands.some((step) => step.args.includes("--update-snapshots")))
    throw new Error("automatic snapshot updates are forbidden");
  if (commands.some((step) => step.args.some((arg) => arg.includes("api.openai.com"))))
    throw new Error("live OpenAI endpoint is forbidden");
}

async function main(): Promise<void> {
  assertReleaseCheckPolicy();
  cleanWorkingTree("preflight");
  console.log(`release:check start (${process.platform}, ${commands.length} child commands)`);

  for (const step of commands) {
    const startedAt = performance.now();
    const result = await run(step.command, step.args, step.shell ?? false);
    const durationMs = Math.round(performance.now() - startedAt);
    const status = result.status === 0 ? "PASS" : "FAIL";
    console.log(`${status} | ${durationMs}ms | ${step.name} | ${redact(commandText(step))}`);
    if (result.status !== 0 || (step.name === "Working tree check" && result.output.trim())) {
      const lines = redact(result.output).trim().split(/\r?\n/);
      console.error(lines.slice(Math.max(0, lines.length - 80)).join("\n"));
      throw new Error(
        `${step.name} failed${result.status === 0 ? " because the tree is dirty" : ` with exit code ${result.status}`}`,
      );
    }
  }

  cleanWorkingTree("postflight");
  console.log("release:check PASS: all required gates executed; working tree clean");
}

try {
  await main();
} catch (error) {
  console.error(
    `release:check FAIL: ${redact(error instanceof Error ? error.message : String(error))}`,
  );
  process.exitCode = 1;
}
