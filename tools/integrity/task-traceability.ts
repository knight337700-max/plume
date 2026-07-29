import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const designRoot =
  process.env.PLUME_DESIGN_ROOT ??
  join(process.env.USERPROFILE ?? homedir(), "Desktop", "da-creative-webapp-design");
const taskRoot = join(designRoot, "04_codex/implementation-tasks");
const failures: string[] = [];

function read(relativePath: string): string | null {
  const path = join(taskRoot, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, found ${actual}`);
}

const catalog = read("atomic-task-catalog.yaml");
const reportSource = read("codex-task-integrity-report.json");
if (!catalog || !reportSource) {
  console.warn(
    "Design task catalog is unavailable; traceability will use repository task markers only",
  );
  const repositoryTaskFiles = readdirSync(join(repositoryRoot, "tools/integrity"), {
    withFileTypes: true,
  }).filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  if (repositoryTaskFiles.length < 3) failures.push("Integrity task checks are incomplete");
} else {
  const report = JSON.parse(reportSource) as {
    metrics?: { task_count?: number; phase_count?: number; gate_count?: number };
  };
  const expectedTaskCount = Number(catalog.match(/task_count:\s*(\d+)/)?.[1] ?? -1);
  const expectedPhaseCount = Number(catalog.match(/phase_count:\s*(\d+)/)?.[1] ?? -1);
  assertEqual(expectedTaskCount, 180, "atomic task catalog count");
  assertEqual(report.metrics?.task_count ?? -1, 180, "task integrity report count");
  assertEqual(report.metrics?.phase_count ?? -1, 16, "task phase count");
  assertEqual(report.metrics?.gate_count ?? -1, 7, "release gate count");

  const phaseDirectory = join(taskRoot, "phases");
  const phaseFiles = readdirSync(phaseDirectory)
    .filter((filename) => filename.endsWith(".yaml"))
    .map((filename) => join(phaseDirectory, filename));
  const taskIds: string[] = [];
  const sequences: number[] = [];
  for (const path of phaseFiles) {
    const source = readFileSync(path, "utf8");
    taskIds.push(
      ...[...source.matchAll(/^- id:\s*(PLM-\d{4})\s*$/gm)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined),
    );
    sequences.push(
      ...[...source.matchAll(/^\s+sequence:\s*(\d+)\s*$/gm)]
        .map((match) => Number(match[1]))
        .filter((value) => Number.isInteger(value)),
    );
  }
  assertEqual(taskIds.length, 180, "phase task ID count");
  assertEqual(sequences.length, 180, "phase task sequence count");
  if (new Set(taskIds).size !== taskIds.length) failures.push("Atomic task IDs are not unique");
  if (new Set(sequences).size !== sequences.length)
    failures.push("Atomic task sequences are not unique");
  const expectedSequences = Array.from({ length: 180 }, (_, index) => index + 1);
  if (sequences.sort((left, right) => left - right).join(",") !== expectedSequences.join(",")) {
    failures.push("Atomic task sequences are not contiguous from 1 to 180");
  }
  for (const taskId of [
    "PLM-0171",
    "PLM-0172",
    "PLM-0173",
    "PLM-0174",
    "PLM-0175",
    "PLM-0176",
    "PLM-0177",
  ]) {
    if (!taskIds.includes(taskId))
      failures.push(`Current Gate G task is missing from catalog: ${taskId}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify({ status: "PASS", taskCount: 180, phaseCount: 16, gateCount: 7 }, null, 2),
  );
}
