export type DomainModuleName =
  | "iam"
  | "client-brand"
  | "asset"
  | "campaign"
  | "media-catalog"
  | "creative"
  | "validation"
  | "approval"
  | "export"
  | "operations";

export interface DomainModuleDefinition {
  readonly name: DomainModuleName;
  readonly dependencies: readonly DomainModuleName[];
  readonly publicExports: readonly string[];
}

export function defineDomainModule<const T extends DomainModuleDefinition>(definition: T): T {
  return Object.freeze({
    ...definition,
    dependencies: Object.freeze([...definition.dependencies]),
    publicExports: Object.freeze([...definition.publicExports]),
  });
}

export function assertModuleDependency(
  module: DomainModuleDefinition,
  dependency: DomainModuleName,
): void {
  if (!module.dependencies.includes(dependency)) {
    throw new Error(`Module ${module.name} cannot depend on ${dependency}`);
  }
}

export function assertPublicModuleImport(module: DomainModuleDefinition, importPath: string): void {
  if (!importPath.endsWith("/public.js") && !importPath.endsWith("/public.ts")) {
    throw new Error(`Module ${module.name} must be imported through its public entrypoint`);
  }
}
