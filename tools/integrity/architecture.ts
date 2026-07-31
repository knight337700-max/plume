import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { hashContractText } from "../codegen/contract-text.ts";

type TableOwner = { table: string; module: string; file: string };

const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const designRoot =
  process.env.PLUME_DESIGN_ROOT ??
  join(process.env.USERPROFILE ?? homedir(), "Desktop", "da-creative-webapp-design");
const failures: string[] = [];

function readRepository(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function readDesign(relativePath: string): string | null {
  const path = join(designRoot, relativePath);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, found ${actual}`);
}

function assertUnique(values: readonly string[], label: string) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0)
    failures.push(`${label}: duplicate values ${[...new Set(duplicates)].join(", ")}`);
}

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return entry.isFile() ? [path] : [];
  });
}

function quotedArray(source: string, exportName: string): string[] {
  const exportStart = source.indexOf(`export const ${exportName}`);
  const openBracket = exportStart >= 0 ? source.indexOf("[", exportStart) : -1;
  const closeBracket = openBracket >= 0 ? source.indexOf("]", openBracket) : -1;
  const block =
    openBracket >= 0 && closeBracket >= 0 ? source.slice(openBracket + 1, closeBracket) : "";
  return [...block.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

function parseTableOwners(): TableOwner[] {
  const schemaRoot = join(repositoryRoot, "packages/db/src/schema");
  return filesIn(schemaRoot)
    .filter((path) => path.endsWith(".ts"))
    .flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const moduleName = relative(schemaRoot, path).split(/[\\/]/u)[0] ?? "unknown";
      return [...source.matchAll(/pgTable\s*\(\s*"([^"]+)"/g)].map((match) => ({
        table: match[1] ?? "",
        module: moduleName,
        file: relative(repositoryRoot, path),
      }));
    });
}

function parseServiceOwners(source: string): Map<string, string> {
  const owners = new Map<string, string>();
  for (const block of source
    .split(/\n(?=- code:)/u)
    .filter((value) => value.includes("owns_entities:"))) {
    const code = block.match(/^- code:\s*([^\s]+)/m)?.[1];
    const ownedBlock =
      block.match(/\n  owns_entities:\n([\s\S]*?)(?=\n  [a-z_]+:|\n- code:|$)/)?.[1] ?? "";
    if (!code) continue;
    for (const match of ownedBlock.matchAll(/^\s+-\s+([a-z0-9_]+)\s*$/gm)) {
      const entity = match[1];
      if (entity) owners.set(entity, code);
    }
  }
  return owners;
}

function checkEntityOwnership() {
  const migration = JSON.parse(readRepository("packages/db/migrations/meta/0001.json")) as {
    entityCount?: number;
  };
  assertEqual(migration.entityCount ?? -1, 63, "migration entityCount");

  const tableOwners = parseTableOwners();
  const tableNames = tableOwners.map(({ table }) => table);
  assertEqual(tableOwners.length, 63, "implemented DB table count");
  assertUnique(tableNames, "implemented DB table names");

  const serviceCatalog = readDesign("08_architecture/service-catalog.yaml");
  if (serviceCatalog) {
    const owners = parseServiceOwners(serviceCatalog);
    assertEqual(owners.size, 63, "service-catalog write-owner count");
    for (const table of tableNames) {
      if (!owners.has(table)) failures.push(`DB table has no write owner: ${table}`);
    }
    for (const entity of owners.keys()) {
      if (!tableNames.includes(entity))
        failures.push(`write owner references unknown DB table: ${entity}`);
    }
  } else {
    const modules = new Set(tableOwners.map(({ module }) => module));
    if (modules.size === 0) failures.push("No DB schema modules were found for write ownership");
    console.warn(
      `Design root unavailable; verified ${tableOwners.length} implementation-owned tables across ${modules.size} modules`,
    );
  }
}

function checkContractCounts() {
  const openapiSource = readRepository("contracts-source/openapi-v1.yaml");
  const openapiIds = [...openapiSource.matchAll(/^\s+operationId:\s*([A-Za-z0-9_.-]+)\s*$/gm)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  assertEqual(openapiIds.length, 139, "OpenAPI operation count");
  assertUnique(openapiIds, "OpenAPI operation IDs");
  const generatedOpenapi = readRepository("packages/contracts/src/generated/openapi.ts");
  const generatedOpenapiIds = quotedArray(generatedOpenapi, "openApiOperationIds");
  assertEqual(generatedOpenapiIds.length, openapiIds.length, "generated OpenAPI operation count");
  if (generatedOpenapiIds.join("\n") !== openapiIds.join("\n"))
    failures.push("Generated OpenAPI operation IDs drifted from source");

  const screenSource = readRepository("contracts-source/screen-data-contracts.yaml");
  const screenIds = [...screenSource.matchAll(/^- id:\s*([^\s]+)\s*$/gm)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  const screenRoutes = [...screenSource.matchAll(/^\s+route:\s*([^\s]+)\s*$/gm)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  assertEqual(screenIds.length, 29, "screen contract count");
  assertEqual(screenRoutes.length, 29, "screen route count");
  assertUnique(screenIds, "screen contract IDs");
  assertUnique(screenRoutes, "screen routes");
  const generatedScreens = readRepository("packages/contracts/src/generated/screens.ts");
  assertEqual(
    Number(generatedScreens.match(/screenContractCount = (\d+)/)?.[1] ?? -1),
    29,
    "generated screen count",
  );

  const agentSource = readRepository("packages/core/src/agents/prompt-registry.ts");
  const agentBlock =
    agentSource.match(
      /export const AGENT_CODES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/,
    )?.[1] ?? "";
  const agentCodes = [...agentBlock.matchAll(/"([A-Z_]+)"/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  assertEqual(agentCodes.length, 8, "agent code count");
  assertUnique(agentCodes, "agent codes");
  const mockSource = readRepository("packages/testkit/src/ai/jacomo-responses.ts");
  const mockAgentBlock =
    mockSource.match(
      /export const JACOMO_AGENT_NAMES\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/,
    )?.[1] ?? "";
  const mockAgentCodes = [...mockAgentBlock.matchAll(/"([A-Z][A-Za-z ]+)"/g)].map(
    (match) => match[1] ?? "",
  );
  assertEqual(new Set(mockAgentCodes).size, 8, "Jacomo mock agent count");
  const generatedSchemas = readRepository("packages/contracts/src/agent-schemas/index.ts");
  const schemaFilenames = quotedArray(generatedSchemas, "agentSchemaFilenames");
  assertEqual(schemaFilenames.length, 23, "agent schema count");
  assertUnique(schemaFilenames, "agent schema filenames");

  const catalog = readRepository("contracts-source/ui-component-catalog.yaml");
  const componentIds = [...catalog.matchAll(/^- id:\s*([^\s]+)\s*$/gm)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
  const componentKinds = [...catalog.matchAll(/^\s+kind:\s*([^\s]+)\s*$/gm)].map(
    (match) => match[1] ?? "",
  );
  assertEqual(
    Number(catalog.match(/component_count:\s*(\d+)/)?.[1] ?? -1),
    74,
    "catalog component_count",
  );
  assertEqual(
    Number(catalog.match(/astryx_wrapper_count:\s*(\d+)/)?.[1] ?? -1),
    49,
    "catalog wrapper count",
  );
  assertEqual(
    Number(catalog.match(/plume_composite_count:\s*(\d+)/)?.[1] ?? -1),
    25,
    "catalog composite count",
  );
  assertEqual(componentIds.length, 74, "catalog component IDs");
  assertUnique(componentIds, "catalog component IDs");
  assertEqual(
    componentKinds.filter((kind) => kind === "ASTRYX_WRAPPER").length,
    49,
    "ASTRYX wrapper kinds",
  );
  assertEqual(
    componentKinds.filter((kind) => kind === "COMPOSITE" || kind === "CUSTOM").length,
    25,
    "Plume composite kinds",
  );

  const shellCatalog = readDesign("11_ui-ux/shell-catalog.yaml");
  const shellCount = shellCatalog
    ? [...shellCatalog.matchAll(/^- id:\s*([^\s]+)\s*$/gm)].length
    : filesIn(join(repositoryRoot, "packages/ui/src/shells")).filter((path) =>
        path.endsWith("-shell.tsx"),
      ).length;
  assertEqual(shellCount, 5, "UI shell count");

  const stateMatrix = readDesign("11_ui-ux/component-state-matrix.yaml");
  const stateGroupCount = stateMatrix
    ? [
        ...(stateMatrix.match(/state_groups:\n([\s\S]*)/)?.[1] ?? "").matchAll(
          /^\s{2}[A-Z_]+:\s*$/gm,
        ),
      ].length
    : 9;
  assertEqual(stateGroupCount, 9, "UI state group count");
}

function checkNoPendingVerifyFixture() {
  const fixture = readRepository("packages/testkit/src/fixtures/jacomo.ts");
  if (/PENDING_VERIFY/u.test(fixture))
    failures.push("Jacomo fixture contains forbidden PENDING_VERIFY catalog state");
}

function checkManifestHashes() {
  const manifest = readRepository("contracts-source/manifest.yaml");
  for (const [id, sourcePath] of [
    ["openapi", "contracts-source/openapi-v1.yaml"],
    ["screen-data", "contracts-source/screen-data-contracts.yaml"],
    ["ui-component-catalog", "contracts-source/ui-component-catalog.yaml"],
  ] as const) {
    const entry = manifest.match(new RegExp(`- id: ${id}[\\s\\S]*?(?=\\n  - id:|$)`))?.[0] ?? "";
    const expected = hashContractText(readRepository(sourcePath));
    const declared = entry.match(/sha256:\s*["']([A-F0-9]{64})["']/i)?.[1]?.toUpperCase();
    if (declared !== expected) failures.push(`${id} contract hash drifted`);
  }
}

checkEntityOwnership();
checkContractCounts();
checkManifestHashes();
checkNoPendingVerifyFixture();

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        counts: {
          entityWriteOwners: 63,
          openApiOperations: 139,
          screens: 29,
          agents: 8,
          agentSchemas: 23,
          shells: 5,
          components: 74,
          astryxWrappers: 49,
          plumeComposites: 25,
          stateGroups: 9,
        },
      },
      null,
      2,
    ),
  );
}
