import { defineDomainModule, type DomainModuleDefinition } from "../module.js";

export const iamModule = defineDomainModule({
  name: "iam",
  dependencies: [],
  publicExports: ["workspace", "membership"],
});
export const clientBrandModule = defineDomainModule({
  name: "client-brand",
  dependencies: ["iam"],
  publicExports: ["advertiser", "brand", "product"],
});
export const assetModule = defineDomainModule({
  name: "asset",
  dependencies: ["iam", "client-brand"],
  publicExports: ["asset", "asset-version"],
});
export const campaignModule = defineDomainModule({
  name: "campaign",
  dependencies: ["iam", "client-brand", "asset", "operations"],
  publicExports: ["campaign", "brief", "generation"],
});
export const mediaCatalogModule = defineDomainModule({
  name: "media-catalog",
  dependencies: [],
  publicExports: ["catalog"],
});
export const creativeModule = defineDomainModule({
  name: "creative",
  dependencies: ["campaign", "asset", "media-catalog", "operations"],
  publicExports: ["creative", "creative-version"],
});
export const validationModule = defineDomainModule({
  name: "validation",
  dependencies: ["creative", "media-catalog", "operations"],
  publicExports: ["validation", "comment"],
});
export const approvalModule = defineDomainModule({
  name: "approval",
  dependencies: ["creative", "validation", "iam"],
  publicExports: ["approval"],
});
export const exportModule = defineDomainModule({
  name: "export",
  dependencies: ["creative", "validation", "approval", "media-catalog", "operations"],
  publicExports: ["export-job", "export-file"],
});
export const operationsModule = defineDomainModule({
  name: "operations",
  dependencies: ["iam"],
  publicExports: ["async-job", "audit"],
});

export const domainModules: readonly DomainModuleDefinition[] = Object.freeze([
  iamModule,
  clientBrandModule,
  assetModule,
  campaignModule,
  mediaCatalogModule,
  creativeModule,
  validationModule,
  approvalModule,
  exportModule,
  operationsModule,
]);

export function getDomainModule(name: DomainModuleDefinition["name"]): DomainModuleDefinition {
  const module = domainModules.find((candidate) => candidate.name === name);
  if (!module) throw new Error(`Unknown domain module: ${name}`);
  return module;
}
