import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const violations: string[] = [];

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return entry.isFile() && /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

function inspectFiles(directories: string[], callback: (file: string, source: string) => void) {
  for (const directory of directories) {
    if (!existsSync(directory)) continue;
    for (const file of filesIn(directory)) callback(file, readFileSync(file, "utf8"));
  }
}

const adapterRoot = join(repositoryRoot, "packages/ui/src/astryx");
inspectFiles(
  [join(repositoryRoot, "packages/ui/src"), join(repositoryRoot, "apps/web/src")],
  (file, source) => {
    if (/from\s+["']@astryxdesign\//u.test(source) && !file.startsWith(adapterRoot)) {
      violations.push(`direct Astryx import outside adapter: ${relative(repositoryRoot, file)}`);
    }
    if (/from\s+["']@plume\/ui\/src\//u.test(source)) {
      violations.push(`deep @plume/ui import: ${relative(repositoryRoot, file)}`);
    }
    if (
      /\bAstryx[A-Z][A-Za-z]+/u.test(source) &&
      !file.startsWith(join(repositoryRoot, "packages/ui/src"))
    ) {
      violations.push(`Astryx symbol leaked outside UI package: ${relative(repositoryRoot, file)}`);
    }
  },
);

const browserTestDirectories = [
  join(repositoryRoot, "apps/api/e2e"),
  join(repositoryRoot, "apps/web/e2e"),
];
inspectFiles(browserTestDirectories, (file, source) => {
  for (const [pattern, description] of [
    [/api\.openai\.com/iu, "external OpenAI endpoint"],
    [/OPENAI_API_KEY/gu, "OpenAI secret reference"],
    [/sk-[A-Za-z0-9]{16,}/u, "OpenAI secret-looking literal"],
    [/-----BEGIN [A-Z ]+PRIVATE KEY-----/u, "private key material"],
  ] as const) {
    if (pattern.test(source))
      violations.push(`${description} in browser test: ${relative(repositoryRoot, file)}`);
  }
});

const visualSpec = join(repositoryRoot, "apps/web/e2e/visual-regression.spec.ts");
if (existsSync(visualSpec)) {
  const source = readFileSync(visualSpec, "utf8");
  if (/reference[_ -]?image|external[_ -]?baseline|setInputFiles\([^)]*reference/iu.test(source)) {
    violations.push("visual regression spec references external/reference image material");
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        checked: "UI import boundaries, naming, mocks, secrets and reference baselines",
      },
      null,
      2,
    ),
  );
}
