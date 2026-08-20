import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  CtaRegistry,
  ErrorRegistryEntry,
  FontAssetRegistry,
  ReferenceFixtureRegistry,
} from "./types.js";

type AjvErrorMapping = {
  defaultCode: string;
  keywordMappings: Array<{
    keyword: string;
    defaultCode: string;
    pathOverrides: Array<{
      pointers: string[];
      code: string;
    }>;
  }>;
};

export type ContractBundle = {
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  manifestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  multiArtifactManifestSchema: Record<string, unknown>;
  metaStaticProfiles: Record<string, unknown>;
  metaStaticPlacementSetSchema: Record<string, unknown>;
  naverPlatformSourceSchema: Record<string, unknown>;
  naverPlatformSourceProfiles: Record<string, unknown>;
  naverFeedSource: Record<string, unknown>;
  naverPlatformSourceRevision: Record<string, unknown>;
  errorRegistry: ReadonlyMap<string, ErrorRegistryEntry>;
  ajvErrorMapping: AjvErrorMapping;
  ctaRegistry: CtaRegistry;
  fontRegistry: FontAssetRegistry;
  referenceRegistry: ReferenceFixtureRegistry;
  naverInputSchema: Record<string, unknown>;
  naverTemplateContract: Record<string, unknown>;
  naverTypography: Record<string, unknown>;
  naverFixedComponents: Record<string, unknown>;
  naverFixedComponentRuntime: Record<string, unknown>;
  naverCtaOptions: Record<string, unknown>;
  naverN2Candidates: Record<string, unknown>;
  naverRuntimeFontPolicy: Record<string, unknown>;
  naverFontContract: Record<string, unknown>;
  naverAssetNormalization: Record<string, unknown>;
  naverFontCompatibility: Record<string, unknown>;
  naverMetricFixtures: Record<string, unknown>;
  naverObjectPlacement: Record<string, unknown>;
  naverPsdMetadata: Record<string, unknown>;
};

async function readJson<T>(projectRoot: string, relativePath: string): Promise<T> {
  const filePath = path.join(projectRoot, ...relativePath.split("/"));
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function loadContracts(projectRoot: string): Promise<ContractBundle> {
  const [
    inputSchema,
    outputSchema,
    manifestSchema,
    responseSchema,
    multiArtifactManifestSchema,
    metaStaticProfiles,
    metaStaticPlacementSetSchema,
    naverPlatformSourceSchema,
    naverPlatformSourceProfiles,
    naverFeedSource,
    naverPlatformSourceRevision,
    errorRegistryJson,
    ajvErrorMapping,
    ctaRegistry,
    fontRegistry,
    referenceRegistry,
    naverInputSchema,
    naverTemplateContract,
    naverTypography,
    naverFixedComponents,
    naverFixedComponentRuntime,
    naverCtaOptions,
    naverN2Candidates,
    naverRuntimeFontPolicy,
    naverFontContract,
    naverAssetNormalization,
    naverFontCompatibility,
    naverMetricFixtures,
    naverObjectPlacement,
    naverPsdMetadata,
  ] = await Promise.all([
    readJson<Record<string, unknown>>(projectRoot, "contracts/input.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/output.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/render-manifest.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/response-envelope.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/multi-artifact-manifest.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/meta-static-profiles.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/meta-static-placement-set.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-platform-composed-source.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-platform-composed-source-profiles.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-feed-source.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-platform-composed-source-revision.json"),
    readJson<{ codes: ErrorRegistryEntry[] }>(projectRoot, "contracts/error-registry.json"),
    readJson<AjvErrorMapping>(projectRoot, "contracts/ajv-error-mapping.json"),
    readJson<CtaRegistry>(projectRoot, "contracts/cta-registry.json"),
    readJson<FontAssetRegistry>(projectRoot, "contracts/font-asset-registry.json"),
    readJson<ReferenceFixtureRegistry>(projectRoot, "contracts/reference-fixture.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-input.schema.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-template-contract.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-typography.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-fixed-components.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-fixed-component-runtime.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-cta-options.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-n2-candidates.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-runtime-font-policy.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-font-contract.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-asset-normalization.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-font-compatibility.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-font-metric-fixtures.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-object-placement.json"),
    readJson<Record<string, unknown>>(projectRoot, "contracts/naver-smartchannel-psd-metadata.json"),
  ]);

  return {
    inputSchema,
    outputSchema,
    manifestSchema,
    responseSchema,
    multiArtifactManifestSchema,
    metaStaticProfiles,
    metaStaticPlacementSetSchema,
    naverPlatformSourceSchema,
    naverPlatformSourceProfiles,
    naverFeedSource,
    naverPlatformSourceRevision,
    errorRegistry: new Map(errorRegistryJson.codes.map((entry) => [entry.code, entry])),
    ajvErrorMapping,
    ctaRegistry,
    fontRegistry,
    referenceRegistry,
    naverInputSchema,
    naverTemplateContract,
    naverTypography,
    naverFixedComponents,
    naverFixedComponentRuntime,
    naverCtaOptions,
    naverN2Candidates,
    naverRuntimeFontPolicy,
    naverFontContract,
    naverAssetNormalization,
    naverFontCompatibility,
    naverMetricFixtures,
    naverObjectPlacement,
    naverPsdMetadata,
  };
}
