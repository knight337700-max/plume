import { readFile } from "node:fs/promises";
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
  const repositoryRoot =
    process.cwd().endsWith("apps\\api") || process.cwd().endsWith("apps/api")
      ? resolve(process.cwd(), "../..")
      : process.cwd();
  const source = await readFile(
    sourcePath ?? resolve(repositoryRoot, "packages/contracts/src/generated/openapi.ts"),
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
  const registered: readonly RegisteredRoute[] = [
    { operationId: "getHealth", method: "GET", path: "/api/v1/health" },
  ];
  const coverage = compareRouteCoverage(operationIds, registered);
  if (process.argv.includes("--check") && coverage.unclassified.length > 0) {
    console.error(JSON.stringify(coverage, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(coverage, null, 2));
  }
}
