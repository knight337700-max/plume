import { Ajv2020 } from "ajv/dist/2020.js";
import sharp from "sharp";

import type {
  MultiArtifactCollection,
  MultiArtifactCollectionManifest,
  MultiArtifactCollectionItem,
  MultiArtifactManifestItem,
} from "@kbr/renderer-contract";

import { canonicalJson } from "./canonical.js";
import type { ContractBundle } from "./contracts.js";
import { loadContracts } from "./contracts.js";
import { createIssue, sortAndDedupeIssues, splitIssues } from "./errors.js";
import { sha256Bytes } from "./hash.js";
import { ImageInputError, inspectImageFile } from "./image-input.js";
import {
  PathSecurityError,
  resolveTrustedInputFile,
  resolveTrustedJobDirectory,
} from "./path-security.js";
import { publishCollectionArtifacts, PublishError } from "./publish.js";
import {
  materializePlatformComposedProfile,
  normalizePlatformComposedSource,
  validatePlatformComposedSource,
  type PlatformComposedSourceSpec,
  type PlatformSourceAsset,
  type PlatformSourceValidationIssue,
} from "./naver-platform-composed.js";
import type { ValidationIssue } from "./types.js";

const COLLECTION_SOURCE_SCHEMA_VERSION = "1.1.0" as const;
const COLLECTION_MANIFEST_FILE_NAME = "collection-manifest.json";
const COLLECTION_PROFILE_ID = "NAVER_FEED_COLLECTION_SOURCE_V1" as const;
const COLLECTION_ITEM_PROFILE_ID = "NAVER_FEED_COLLECTION_ITEM_IMAGE_600X600" as const;
const COLLECTION_PLACEMENT = "MOBILE_DA_FEED" as const;
const COLLECTION_MIN_ITEMS = 4;
const COLLECTION_MAX_ITEMS = 10;
const COLLECTION_SAFE_AREA = { x: 30, y: 30, width: 540, height: 540 } as const;
const COLLECTION_OUTPUT_DIRECTORY = ".";
const COLLECTION_OUTPUT_BASE_NAME = "naver-feed-collection";

export type NaverFeedCollectionRenderRequest = Readonly<
  Omit<PlatformComposedSourceSpec, "schemaVersion" | "channel" | "placement" | "compositionMode" | "artifactCardinality" | "sourceProfileId"> & {
    schemaVersion?: "1.0.0" | "1.1.0";
    channel?: "NAVER_GFA";
    placement?: "MOBILE_DA_FEED";
    compositionMode?: "PLATFORM_COMPOSED";
    artifactCardinality?: "COLLECTION";
    sourceProfileId?: typeof COLLECTION_PROFILE_ID;
    output?: Readonly<{
      directory?: string;
      baseName?: string;
      overwrite?: boolean;
    }>;
  }
>;

export type NaverCollectionItemArtifact = Readonly<{
  itemId: string;
  index: number;
  bytes: Buffer;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  artifactChecksum: string;
  pixelFingerprint: string;
  requestFingerprint: string;
  sourceProfileId: string;
  assetId: string;
  fileName: string;
}>;

export type NaverFeedCollectionManifest = MultiArtifactCollectionManifest;

export type NaverFeedCollectionRenderResult = Readonly<{
  status: "PASS" | "BLOCKED";
  downloadAllowed: boolean;
  manifestDigest: string | null;
  manifestPath: string | null;
  artifactPaths: readonly string[];
  manifest: NaverFeedCollectionManifest | null;
  artifacts: readonly NaverCollectionItemArtifact[];
  collectionFingerprint: string | null;
  requestFingerprint: string | null;
  finalUiRendered: false;
  finalUiChecksum: null;
  partialPublish: false;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}>;

export type NaverFeedCollectionRenderOptions = Readonly<{
  projectRoot: string;
  inputRoot: string;
  outputRoot: string;
  contracts?: ContractBundle;
  publish?: boolean;
}>;

type ResolvedCollectionAsset = Readonly<{
  descriptor: PlatformSourceAsset;
  filePath: string;
  bytes: Buffer;
  actualMime: "image/png" | "image/jpeg";
  actualWidth: number;
  actualHeight: number;
  actualBytes: number;
  actualHasAlpha: boolean;
  digest: string;
  pixelFingerprint: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nfc(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(nfc);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, nfc(child)]));
  return value;
}

function issueFromSource(contracts: ContractBundle, value: PlatformSourceValidationIssue): ValidationIssue {
  return createIssue(contracts.errorRegistry, value.code, value.path, {
    ...(value.actual === undefined ? {} : { actual: value.actual }),
    ...(value.expected === undefined ? {} : { expected: value.expected }),
  });
}

function resultFailure(
  issues: readonly ValidationIssue[],
  details: Partial<Pick<NaverFeedCollectionRenderResult, "collectionFingerprint" | "requestFingerprint" | "artifacts">> = {},
): NaverFeedCollectionRenderResult {
  const sorted = sortAndDedupeIssues(issues);
  const { errors, warnings } = splitIssues(sorted);
  return {
    status: "BLOCKED",
    downloadAllowed: false,
    manifestDigest: null,
    manifestPath: null,
    artifactPaths: [],
    manifest: null,
    artifacts: details.artifacts ?? [],
    collectionFingerprint: details.collectionFingerprint ?? null,
    requestFingerprint: details.requestFingerprint ?? null,
    finalUiRendered: false,
    finalUiChecksum: null,
    partialPublish: false,
    errors,
    warnings,
  };
}

function sourceWithoutOutput(request: NaverFeedCollectionRenderRequest): PlatformComposedSourceSpec {
  const rest = Object.fromEntries(Object.entries(request).filter(([key]) => key !== "output"));
  const schemaVersion = request.schemaVersion ?? COLLECTION_SOURCE_SCHEMA_VERSION;
  const channel = request.channel ?? "NAVER_GFA";
  const placement = request.placement ?? COLLECTION_PLACEMENT;
  const compositionMode = request.compositionMode ?? "PLATFORM_COMPOSED";
  const artifactCardinality = request.artifactCardinality ?? "COLLECTION";
  const sourceProfileId = request.sourceProfileId ?? COLLECTION_PROFILE_ID;
  return {
    ...rest,
    schemaVersion,
    channel,
    placement,
    compositionMode,
    artifactCardinality,
    sourceProfileId,
  } as PlatformComposedSourceSpec;
}

function assetPathForItem(index: number, itemId: string, mime: "image/png" | "image/jpeg"): string {
  const extension = mime === "image/png" ? "png" : "jpg";
  const idDigest = sha256Bytes(itemId).slice(0, 16);
  return `item-${String(index).padStart(2, "0")}-${idDigest}.${extension}`;
}

function itemFingerprintMaterial(
  source: PlatformComposedSourceSpec,
  item: MultiArtifactCollectionItem,
  asset: ResolvedCollectionAsset,
): Record<string, unknown> {
  return {
    schemaVersion: source.schemaVersion,
    channel: source.channel,
    placement: source.placement,
    compositionMode: source.compositionMode,
    artifactCardinality: "COLLECTION",
    sourceProfileId: item.sourceProfileId,
    itemId: item.id,
    assetId: item.assetId,
    fields: item.fields,
    ...(item.metadata ? { metadata: item.metadata } : {}),
    asset: {
      sourceProfileId: asset.descriptor.sourceProfileId,
      mime: asset.actualMime,
      width: asset.actualWidth,
      height: asset.actualHeight,
      bytes: asset.actualBytes,
      sha256: asset.digest,
      safeArea: COLLECTION_SAFE_AREA,
    },
  };
}

function collectionFingerprintMaterial(
  source: PlatformComposedSourceSpec,
  items: readonly NaverCollectionItemArtifact[],
): Record<string, unknown> {
  return {
    schemaVersion: source.schemaVersion,
    channel: source.channel,
    placement: source.placement,
    compositionMode: source.compositionMode,
    artifactCardinality: "COLLECTION",
    sourceProfileId: source.sourceProfileId,
    fields: source.fields,
    ...(source.metadata ? { metadata: source.metadata } : {}),
    items: items.map((item) => ({
      id: item.itemId,
      index: item.index,
      sourceProfileId: item.sourceProfileId,
      assetId: item.assetId,
      requestFingerprint: item.requestFingerprint,
    })),
  };
}

function requestFingerprintMaterial(source: PlatformComposedSourceSpec, items: readonly NaverCollectionItemArtifact[]): Record<string, unknown> {
  return {
    source: {
      schemaVersion: source.schemaVersion,
      channel: source.channel,
      placement: source.placement,
      compositionMode: source.compositionMode,
      artifactCardinality: source.artifactCardinality,
      sourceProfileId: source.sourceProfileId,
      fields: source.fields,
      assets: source.assets.map((asset) => ({
        assetId: asset.assetId,
        assetRole: asset.assetRole,
        sourceProfileId: asset.sourceProfileId,
        mime: asset.mime,
        width: asset.width,
        height: asset.height,
        bytes: asset.bytes,
        sha256: asset.sha256 ?? null,
        hasAlpha: asset.hasAlpha ?? null,
        safeArea: asset.safeArea ?? null,
      })),
      collection: source.collection,
      metadata: source.metadata ?? null,
    },
    itemRequestFingerprints: items.map((item) => item.requestFingerprint),
  };
}

async function pixelFingerprint(bytes: Buffer): Promise<string> {
  const decoded = await sharp(bytes, { failOn: "error" })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sha256Bytes(Buffer.concat([
    Buffer.from(canonicalJson({ width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels }), "utf8"),
    decoded.data,
  ]));
}

async function inspectCollectionAssets(
  source: PlatformComposedSourceSpec,
  inputRoot: string,
  contracts: ContractBundle,
): Promise<{ assets: Map<string, ResolvedCollectionAsset>; issues: ValidationIssue[] }> {
  const assets = new Map<string, ResolvedCollectionAsset>();
  const issues: ValidationIssue[] = [];
  for (const [index, descriptor] of source.assets.entries()) {
    const pathValue = `/assets/${index}`;
    if (!descriptor.pathRef) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", pathValue, {
        actual: "pathRef is required for source artifact runtime",
        assetId: descriptor.assetId,
      }));
      continue;
    }
    let filePath: string;
    try {
      filePath = await resolveTrustedInputFile(inputRoot, descriptor.pathRef);
    } catch (error) {
      issues.push(createIssue(contracts.errorRegistry, error instanceof PathSecurityError ? "KBR-INPUT-009" : "KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", pathValue, {
        actual: descriptor.pathRef,
        assetId: descriptor.assetId,
      }));
      continue;
    }
    try {
      const inspected = await inspectImageFile(filePath);
      const digest = sha256Bytes(inspected.bytes);
      const actual = inspected.metadata;
      if (descriptor.sha256 && descriptor.sha256.toLowerCase() !== digest) {
        issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-COLLECTION-ASSET-CHECKSUM", pathValue, {
          actual: digest,
          expected: descriptor.sha256,
          assetId: descriptor.assetId,
        }));
      }
      if (descriptor.width !== actual.width || descriptor.height !== actual.height) {
        issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-ASSET-DIMENSION", pathValue, {
          actual: { width: actual.width, height: actual.height },
          expected: { width: descriptor.width, height: descriptor.height },
          assetId: descriptor.assetId,
        }));
      }
      if (descriptor.mime !== actual.detectedMimeType) {
        issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-ASSET-MIME", pathValue, {
          actual: actual.detectedMimeType,
          expected: descriptor.mime,
          assetId: descriptor.assetId,
        }));
      }
      if (descriptor.bytes !== actual.bytes) {
        issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-ASSET-FILESIZE", pathValue, {
          actual: actual.bytes,
          expected: descriptor.bytes,
          assetId: descriptor.assetId,
        }));
      }
      if (descriptor.hasAlpha !== undefined && descriptor.hasAlpha !== actual.hasAlpha) {
        issues.push(createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-ASSET-ALPHA", pathValue, {
          actual: actual.hasAlpha,
          expected: descriptor.hasAlpha,
          assetId: descriptor.assetId,
        }));
      }
      assets.set(descriptor.assetId, {
        descriptor,
        filePath,
        bytes: inspected.bytes,
        actualMime: actual.detectedMimeType,
        actualWidth: actual.width,
        actualHeight: actual.height,
        actualBytes: actual.bytes,
        actualHasAlpha: actual.hasAlpha,
        digest,
        pixelFingerprint: await pixelFingerprint(inspected.bytes),
      });
    } catch (error) {
      const code = error instanceof ImageInputError ? error.code : "KBR-IMAGE-DECODE-FAILED";
      issues.push(createIssue(contracts.errorRegistry, code, pathValue, { actual: descriptor.pathRef, assetId: descriptor.assetId }));
    }
  }
  return { assets, issues };
}

function assertManifest(manifest: MultiArtifactCollectionManifest, contracts: ContractBundle): void {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile<MultiArtifactCollectionManifest>(contracts.multiArtifactManifestSchema);
  if (!validate(manifest)) throw new Error(`Internal collection manifest schema mismatch: ${JSON.stringify(validate.errors)}`);
}

export function isNaverFeedCollectionRenderRequest(value: unknown): value is NaverFeedCollectionRenderRequest {
  return isRecord(value)
    && (value.artifactCardinality === undefined || value.artifactCardinality === "COLLECTION")
    && (value.sourceProfileId === undefined || value.sourceProfileId === COLLECTION_PROFILE_ID)
    && (value.placement === undefined || value.placement === COLLECTION_PLACEMENT)
    && isRecord(value.collection);
}

export async function renderNaverFeedCollection(
  request: NaverFeedCollectionRenderRequest,
  options: NaverFeedCollectionRenderOptions,
): Promise<NaverFeedCollectionRenderResult> {
  const contracts = options.contracts ?? await loadContracts(options.projectRoot);
  const source = normalizePlatformComposedSource(sourceWithoutOutput(nfc(request) as NaverFeedCollectionRenderRequest));
  const profile = materializePlatformComposedProfile(contracts.naverPlatformSourceProfiles, COLLECTION_PROFILE_ID);
  if (!profile) return resultFailure([createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-PROFILE", "/sourceProfileId", { actual: COLLECTION_PROFILE_ID })]);

  const sourceValidation = validatePlatformComposedSource(source, profile);
  const sourceIssues = sourceValidation.errors.concat(sourceValidation.warnings).map((entry) => issueFromSource(contracts, entry));
  const assetResult = await inspectCollectionAssets(source, options.inputRoot, contracts);
  const initialIssues = sortAndDedupeIssues([...sourceIssues, ...assetResult.issues]);
  if (initialIssues.some((entry) => entry.severity === "ERROR")) return resultFailure(initialIssues);

  const collection = source.collection as MultiArtifactCollection;
  const artifacts: NaverCollectionItemArtifact[] = [];
  for (const [index, item] of collection.items.entries()) {
    const asset = assetResult.assets.get(item.assetId);
    if (!asset) continue;
    const itemMaterial = itemFingerprintMaterial(source, item, asset);
    const itemRequestFingerprint = sha256Bytes(Buffer.from(canonicalJson(itemMaterial), "utf8"));
    artifacts.push({
      itemId: item.id,
      index,
      bytes: asset.bytes,
      mime: asset.actualMime,
      width: asset.actualWidth,
      height: asset.actualHeight,
      artifactChecksum: asset.digest,
      pixelFingerprint: asset.pixelFingerprint,
      requestFingerprint: itemRequestFingerprint,
      sourceProfileId: item.sourceProfileId,
      assetId: item.assetId,
      fileName: assetPathForItem(index, item.id, asset.actualMime),
    });
  }
  if (artifacts.length !== collection.items.length) {
    return resultFailure([...initialIssues, createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-COLLECTION-ITEM-INVALID", "/collection/items", {
      actual: "one or more item assets could not be resolved",
    })], { artifacts });
  }

  const collectionFingerprint = sha256Bytes(Buffer.from(canonicalJson(collectionFingerprintMaterial(source, artifacts)), "utf8"));
  const requestFingerprint = sha256Bytes(Buffer.from(canonicalJson(requestFingerprintMaterial(source, artifacts)), "utf8"));
  const manifestItems: MultiArtifactManifestItem[] = artifacts.map((artifact) => ({
    itemId: artifact.itemId,
    index: artifact.index,
    artifactChecksum: artifact.artifactChecksum,
    pixelFingerprint: artifact.pixelFingerprint,
    requestFingerprint: artifact.requestFingerprint,
    sourceProfileId: artifact.sourceProfileId,
    assetId: artifact.assetId,
    mime: artifact.mime,
    width: artifact.width,
    height: artifact.height,
    bytes: artifact.bytes.byteLength,
    artifactPath: artifact.fileName.replaceAll("\\", "/"),
  }));
  const manifest: MultiArtifactCollectionManifest = {
    schemaVersion: "1.0.0",
    kind: "COLLECTION_MANIFEST",
    channel: source.channel,
    placement: source.placement,
    compositionMode: source.compositionMode,
    artifactCardinality: "COLLECTION",
    sourceProfileId: source.sourceProfileId,
    collectionFingerprint,
    requestFingerprint,
    itemCount: manifestItems.length,
    items: manifestItems,
    finalUiRendered: false,
    finalUiChecksum: null,
    partialPublish: false,
  };
  try {
    assertManifest(manifest, contracts);
  } catch {
    return resultFailure([...initialIssues, createIssue(contracts.errorRegistry, "KBR-SYSTEM-005", "/collection")], {
      collectionFingerprint,
      requestFingerprint,
      artifacts,
    });
  }
  const manifestText = canonicalJson(manifest);
  const manifestDigest = sha256Bytes(Buffer.from(manifestText, "utf8"));
  if (options.publish === false) {
    const { warnings } = splitIssues(initialIssues);
    return {
      status: "PASS",
      downloadAllowed: false,
      manifestDigest,
      manifestPath: null,
      artifactPaths: [],
      manifest,
      artifacts,
      collectionFingerprint,
      requestFingerprint,
      finalUiRendered: false,
      finalUiChecksum: null,
      partialPublish: false,
      errors: [],
      warnings,
    };
  }

  const output = request.output ?? {};
  let jobDirectory: string;
  try {
    jobDirectory = await resolveTrustedJobDirectory(
      options.outputRoot,
      output.directory ?? COLLECTION_OUTPUT_DIRECTORY,
      output.baseName ?? COLLECTION_OUTPUT_BASE_NAME,
    );
  } catch (error) {
    return resultFailure([...initialIssues, createIssue(contracts.errorRegistry, "KBR-INPUT-009", "/output", { actual: error instanceof Error ? error.message : String(error) })], {
      collectionFingerprint,
      requestFingerprint,
      artifacts,
    });
  }

  try {
    const published = await publishCollectionArtifacts({
      outputRoot: options.outputRoot,
      jobDirectory,
      artifacts: artifacts.map((artifact) => ({ fileName: artifact.fileName, bytes: artifact.bytes })),
      manifest: manifestText,
      manifestFileName: COLLECTION_MANIFEST_FILE_NAME,
      overwrite: output.overwrite === true,
    });
    const { warnings } = splitIssues(initialIssues);
    return {
      status: "PASS",
      downloadAllowed: true,
      manifestDigest,
      manifestPath: published.manifestPath,
      artifactPaths: published.artifactPaths,
      manifest,
      artifacts,
      collectionFingerprint,
      requestFingerprint,
      finalUiRendered: false,
      finalUiChecksum: null,
      partialPublish: false,
      errors: [],
      warnings,
    };
  } catch (error) {
    const code = error instanceof PublishError ? error.code : "KBR-SYSTEM-004";
    return resultFailure([...initialIssues, createIssue(contracts.errorRegistry, code, "/output")], {
      collectionFingerprint,
      requestFingerprint,
      artifacts,
    });
  }
}

export const NAVER_FEED_COLLECTION_CONTRACT = Object.freeze({
  profileId: COLLECTION_PROFILE_ID,
  itemSourceProfileId: COLLECTION_ITEM_PROFILE_ID,
  placement: COLLECTION_PLACEMENT,
  minimumItems: COLLECTION_MIN_ITEMS,
  maximumItems: COLLECTION_MAX_ITEMS,
  safeArea: COLLECTION_SAFE_AREA,
  finalUiRendered: false,
});
