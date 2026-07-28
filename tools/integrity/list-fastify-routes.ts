import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface RegisteredRoute {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
}

export interface RouteCoverage {
  readonly implemented: readonly RegisteredRoute[];
  readonly pending: readonly string[];
  readonly unclassified: readonly RegisteredRoute[];
}

function repositoryRoot(): string {
  return process.cwd().endsWith("apps\\api") || process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../..")
    : process.cwd();
}

async function routeSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await routeSourceFiles(path)));
    else if (entry.isFile() && path.endsWith(".ts")) files.push(path);
  }
  return files;
}

export async function readRegisteredRoutes(
  sourceDirectory?: string,
): Promise<readonly RegisteredRoute[]> {
  const routes: RegisteredRoute[] = [];
  const routeFiles = await routeSourceFiles(
    sourceDirectory ?? resolve(repositoryRoot(), "apps/api/src/routes"),
  );
  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    const routePattern =
      /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"[\s\S]*?operationId:\s*"([^"]+)"/g;
    for (const match of source.matchAll(routePattern)) {
      const method = match[1];
      const path = match[2];
      const operationId = match[3];
      if (method && path && operationId)
        routes.push({ method: method.toUpperCase(), path, operationId });
    }
  }
  return routes;
}

export function compareRouteCoverage(
  operationIds: readonly string[],
  registered: readonly RegisteredRoute[],
): RouteCoverage {
  const catalog = new Set(operationIds);
  const known = registered.filter((route) => catalog.has(route.operationId));
  const unclassified = registered.filter((route) => !catalog.has(route.operationId));
  const implementedIds = new Set(known.map((route) => route.operationId));
  return {
    implemented: known,
    pending: operationIds.filter((operationId) => !implementedIds.has(operationId)),
    unclassified,
  };
}

export async function readOpenApiOperationIds(sourcePath?: string): Promise<readonly string[]> {
  const source = await readFile(
    sourcePath ?? resolve(repositoryRoot(), "packages/contracts/src/generated/openapi.ts"),
    "utf8",
  );
  const block =
    source.match(/openApiOperationIds\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((operationId): operationId is string => operationId !== undefined);
}

if (
  process.argv[1]?.endsWith("list-fastify-routes.ts") ||
  process.argv[1]?.endsWith("list-fastify-routes.js")
) {
  const operationIds = await readOpenApiOperationIds();
  const registered = await readRegisteredRoutes();
  const coverage = compareRouteCoverage(operationIds, registered);
  if (process.argv.includes("--check") && coverage.unclassified.length > 0) {
    console.error(JSON.stringify(coverage, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(coverage, null, 2));
  }
}
