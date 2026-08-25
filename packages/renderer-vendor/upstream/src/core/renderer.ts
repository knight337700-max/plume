import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyRuntimeAssets, type RuntimeAssets } from "./assets.js";
import { canonicalDigest, canonicalJson } from "./canonical.js";
import type { ContractBundle } from "./contracts.js";
import { loadContracts } from "./contracts.js";
import {
  INPUT_SCHEMA_VERSION,
  MANIFEST_SCHEMA_VERSION,
  OUTPUT_SCHEMA_VERSION,
  RESPONSE_SCHEMA_VERSION,
  TEMPLATE_CONTRACT_VERSION,
} from "./constants.js";
import { createIssue, sortAndDedupeIssues, splitIssues } from "./errors.js";
import { sha256Bytes } from "./hash.js";
import { calculateLayout } from "./layout.js";
import { applyDefaults, normalizeInput } from "./normalize.js";
import {
  freeformResponseFromResult,
  isFreeformRenderRequest,
  renderFreeform,
  type FreeformRenderRequest,
  type FreeformRenderResult,
} from "./freeform.js";
import { isSmartChannelRenderRequest, renderSmartChannel } from "./naver-smartchannel.js";
import {
  PathSecurityError,
  resolveTrustedInputFile,
  resolveTrustedJobDirectory,
  resolveTrustedRoot,
} from "./path-security.js";
import { analyzeAndResizeProduct } from "./product-image.js";
import {
  isNaverFeedCollectionRenderRequest,
  renderNaverFeedCollection,
  type NaverFeedCollectionRenderRequest,
  type NaverFeedCollectionRenderResult,
} from "./naver-collection.js";
import { PublishError, publishArtifacts } from "./publish.js";
import { renderRgbaPng, validateRenderedPng } from "./raster.js";
import { SchemaValidators, parseJsonInput } from "./schema-validation.js";
import { validateCanonicalSemantics, validateRawText } from "./semantic-validation.js";
import type {
  CanonicalInput,
  InternalPreviewResult,
  LayoutMeasurements,
  RenderManifest,
  RendererConfig,
  RenderResponse,
  ValidationIssue,
} from "./types.js";

const RENDERER_VERSION = "0.9.0";

function failureResponse(issues: readonly ValidationIssue[]): RenderResponse {
  const sorted = sortAndDedupeIssues(issues);
  const { errors, warnings } = splitIssues(sorted);
  if (errors.length === 0) throw new Error("Failure response requires at least one ERROR");
  return {
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    manifestDigest: null,
    pngDigest: null,
    manifestPath: null,
    pngPath: null,
    downloadAllowed: false,
    status: "FAIL",
    errors,
    warnings,
  };
}

function manualAcceptanceStatus(): RenderManifest["manualAcceptanceStatus"] {
  return {
    status: "NOT_REVIEWED",
    items: ["M-001", "M-002", "M-003", "M-004", "M-005", "M-006"].map((id) => ({
      id,
      status: "NOT_REVIEWED" as const,
      reviewer: null,
      reviewedAt: null,
    })),
  };
}

type PreparedFailure = {
  ok: false;
  response: RenderResponse;
  canonicalInputDigest: string | null;
  productAssetDigest: string | null;
  measurements: LayoutMeasurements | null;
};

type PreparedSuccess = {
  ok: true;
  canonicalInput: CanonicalInput;
  canonicalInputDigest: string;
  productAssetDigest: string;
  measurements: LayoutMeasurements;
  png: Buffer;
  pngDigest: string;
  issues: ValidationIssue[];
  jobDirectory: string;
  assets: RuntimeAssets;
};

type PreparedRender = PreparedFailure | PreparedSuccess;

function preparedFailure(
  issues: readonly ValidationIssue[],
  detail: {
    canonicalInputDigest?: string | null;
    productAssetDigest?: string | null;
    measurements?: LayoutMeasurements | null;
  } = {},
): PreparedFailure {
  return {
    ok: false,
    response: failureResponse(issues),
    canonicalInputDigest: detail.canonicalInputDigest ?? null,
    productAssetDigest: detail.productAssetDigest ?? null,
    measurements: detail.measurements ?? null,
  };
}

function previewFailure(failure: PreparedFailure): InternalPreviewResult {
  return {
    canonicalInputDigest: failure.canonicalInputDigest,
    normalizedInputDigest: failure.canonicalInputDigest,
    productAssetDigest: failure.productAssetDigest,
    previewPngDigest: null,
    png: null,
    pngMetadata: null,
    measurements: failure.measurements,
    validationStatus: "ERROR",
    errors: failure.response.errors,
    warnings: failure.response.warnings,
  };
}

export type KakaoBizboardRenderer = {
  render(request: unknown): Promise<RenderResponse>;
  renderJson(json: string): Promise<RenderResponse>;
  renderFreeform(request: FreeformRenderRequest): Promise<FreeformRenderResult>;
  renderNaverFeedCollection(request: NaverFeedCollectionRenderRequest): Promise<NaverFeedCollectionRenderResult>;
  /** @internal Used only by the local Desktop Main Process. Never publishes files. */
  previewInternal(request: unknown): Promise<InternalPreviewResult>;
};

export async function createKakaoBizboardRenderer(config: RendererConfig): Promise<KakaoBizboardRenderer> {
  const [projectRoot, inputRoot, outputRoot] = await Promise.all([
    resolveTrustedRoot(config.projectRoot),
    resolveTrustedRoot(config.inputRoot),
    resolveTrustedRoot(config.outputRoot),
  ]);
  const contracts = await loadContracts(projectRoot);
  const schemas: SchemaValidators = new SchemaValidators(contracts);
  const assetVerification = await verifyRuntimeAssets(projectRoot, contracts);

  async function prepare(request: unknown): Promise<PreparedRender> {
    const schemaResult = schemas.validateInput(request);
    if (!schemaResult.valid) return preparedFailure(schemaResult.issues);

    const rawTextIssues = validateRawText(schemaResult.value, contracts);
    const defaulted = applyDefaults(schemaResult.value);
    const canonicalInput = normalizeInput(defaulted);
    const canonicalInputDigest = canonicalDigest(canonicalInput);
    const semanticIssues = validateCanonicalSemantics(canonicalInput, contracts);
    const preAssetIssues = sortAndDedupeIssues([
      ...rawTextIssues,
      ...semanticIssues,
      ...assetVerification.issues,
    ]);
    if (preAssetIssues.some(({ severity }) => severity === "ERROR")) {
      return preparedFailure(preAssetIssues, { canonicalInputDigest });
    }
    if (!assetVerification.assets) {
      return preparedFailure(
        [createIssue(contracts.errorRegistry, "KBR-SYSTEM-001", "/assets/fonts")],
        { canonicalInputDigest },
      );
    }

    let productPath: string;
    try {
      productPath = await resolveTrustedInputFile(inputRoot, canonicalInput.assets.product.path);
    } catch (error) {
      if (error instanceof PathSecurityError) {
        return preparedFailure(
          [
            ...preAssetIssues,
            createIssue(contracts.errorRegistry, "KBR-INPUT-009", "/assets/product/path", {
              actual: error.inputPath,
            }),
          ],
          { canonicalInputDigest },
        );
      }
      throw error;
    }

    let jobDirectory: string;
    try {
      jobDirectory = await resolveTrustedJobDirectory(
        outputRoot,
        canonicalInput.output.directory,
        canonicalInput.output.baseName,
      );
    } catch (error) {
      if (error instanceof PathSecurityError) {
        return preparedFailure(
          [
            ...preAssetIssues,
            createIssue(contracts.errorRegistry, "KBR-INPUT-009", "/output/directory", {
              actual: error.inputPath,
            }),
          ],
          { canonicalInputDigest },
        );
      }
      throw error;
    }

    const productResult = await analyzeAndResizeProduct(
      productPath,
      canonicalInput.assets.product.expectedSha256,
      contracts,
    );
    const productIssues = sortAndDedupeIssues([...preAssetIssues, ...productResult.issues]);
    if (productIssues.some(({ severity }) => severity === "ERROR")) {
      return preparedFailure(productIssues, {
        canonicalInputDigest,
        productAssetDigest: productResult.productDigest ?? null,
      });
    }
    if (!productResult.analysis || !productResult.productDigest) {
      return preparedFailure(
        [...productIssues, createIssue(contracts.errorRegistry, "KBR-SYSTEM-005", "/assets/product/path")],
        { canonicalInputDigest, productAssetDigest: productResult.productDigest ?? null },
      );
    }

    const layout = calculateLayout(canonicalInput, productResult.analysis, contracts);
    const layoutIssues = sortAndDedupeIssues([...productIssues, ...layout.issues]);
    if (layoutIssues.some(({ severity }) => severity === "ERROR")) {
      return preparedFailure(layoutIssues, {
        canonicalInputDigest,
        productAssetDigest: productResult.productDigest,
        measurements: layout.measurements,
      });
    }

    const png = renderRgbaPng(canonicalInput, productResult.analysis);
    const outputIssues = await validateRenderedPng(png, contracts);
    const issues = sortAndDedupeIssues([...layoutIssues, ...outputIssues]);
    if (issues.some(({ severity }) => severity === "ERROR")) {
      return preparedFailure(issues, {
        canonicalInputDigest,
        productAssetDigest: productResult.productDigest,
        measurements: layout.measurements,
      });
    }

    return {
      ok: true,
      canonicalInput,
      canonicalInputDigest,
      productAssetDigest: productResult.productDigest,
      measurements: layout.measurements,
      png,
      pngDigest: sha256Bytes(png),
      issues,
      jobDirectory,
      assets: assetVerification.assets,
    };
  }

  async function render(request: unknown): Promise<RenderResponse> {
    const prepared = await prepare(request);
    if (!prepared.ok) return prepared.response;

    const completeIssues = sortAndDedupeIssues([
      ...prepared.issues,
      createIssue(contracts.errorRegistry, "KBR-OUTPUT-010", "/output"),
    ]);
    const issueGroups = splitIssues(completeIssues);
    const manifest: RenderManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      canonicalInputDigest: prepared.canonicalInputDigest,
      normalizedInputDigest: prepared.canonicalInputDigest,
      outputPngDigest: prepared.pngDigest,
      templateContractVersion: TEMPLATE_CONTRACT_VERSION,
      inputSchemaVersion: INPUT_SCHEMA_VERSION,
      outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      validatorResult: {
        errorCount: 0,
        warningCount: issueGroups.warnings.length,
        infoCount: issueGroups.infos.length,
        issues: completeIssues,
      },
      assetDigests: {
        product: { id: "PRODUCT", sha256: prepared.productAssetDigest },
        fonts: prepared.assets.fontDigests,
        approvedIcons: [],
        referenceFixture: prepared.assets.referenceDigest,
      },
      manualAcceptanceStatus: manualAcceptanceStatus(),
    };
    schemas.assertManifest(manifest);
    const manifestText = canonicalJson(manifest);
    const manifestDigest = sha256Bytes(Buffer.from(manifestText, "utf8"));
    const expectedManifestPath = path.join(prepared.jobDirectory, "render-manifest.json");
    const expectedPngPath = path.join(prepared.jobDirectory, "output.png");
    const responseDraft: RenderResponse = {
      schemaVersion: RESPONSE_SCHEMA_VERSION,
      manifestDigest,
      pngDigest: prepared.pngDigest,
      manifestPath: expectedManifestPath,
      pngPath: expectedPngPath,
      downloadAllowed: true,
      status: "PASS",
      errors: [],
      warnings: issueGroups.warnings,
    };
    schemas.assertResponse(responseDraft);

    try {
      const published = await publishArtifacts({
        outputRoot,
        jobDirectory: prepared.jobDirectory,
        png: prepared.png,
        manifest: manifestText,
        overwrite: prepared.canonicalInput.output.overwrite,
      });
      return {
        ...responseDraft,
        manifestPath: published.manifestPath,
        pngPath: published.pngPath,
      };
    } catch (error) {
      if (error instanceof PublishError) {
        return failureResponse([
          ...prepared.issues,
          createIssue(contracts.errorRegistry, error.code, "/output"),
        ]);
      }
      throw error;
    }
  }

  async function previewInternal(request: unknown): Promise<InternalPreviewResult> {
    try {
      if (isFreeformRenderRequest(request)) {
        const freeform = await renderFreeform(request, {
          projectRoot,
          inputRoot,
          outputRoot,
          contracts,
          publish: false,
        });
        return {
          canonicalInputDigest: freeform.requestFingerprint,
          normalizedInputDigest: freeform.pixelFingerprint,
          productAssetDigest: null,
          previewPngDigest: freeform.pngDigest,
          png: freeform.png,
          pngMetadata: freeform.png
            ? {
                format: "PNG",
                colorType: "RGBA",
                bitDepth: 8,
                hasAlpha: true,
                width: 1029,
                height: 258,
                bytes: freeform.png.byteLength,
              }
            : null,
          measurements: null,
          validationStatus: freeform.status === "PASS"
            ? freeform.warnings.length > 0 ? "WARNING" : "PASS"
            : "ERROR",
          errors: freeform.errors,
          warnings: freeform.warnings,
        };
      }
      const prepared = await prepare(request);
      if (!prepared.ok) return previewFailure(prepared);
      const { warnings } = splitIssues(prepared.issues);
      return {
        canonicalInputDigest: prepared.canonicalInputDigest,
        normalizedInputDigest: prepared.canonicalInputDigest,
        productAssetDigest: prepared.productAssetDigest,
        previewPngDigest: prepared.pngDigest,
        png: prepared.png,
        pngMetadata: {
          format: "PNG",
          colorType: "RGBA",
          bitDepth: 8,
          hasAlpha: true,
          width: 1029,
          height: 258,
          bytes: prepared.png.byteLength,
        },
        measurements: prepared.measurements,
        validationStatus: warnings.length > 0 ? "WARNING" : "PASS",
        errors: [],
        warnings,
      };
    } catch (error) {
      if (process.env.KBR_DEBUG === "1") {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      }
      return previewFailure(
        preparedFailure([createIssue(contracts.errorRegistry, "KBR-SYSTEM-005", "/")]),
      );
    }
  }

  async function renderSafe(request: unknown): Promise<RenderResponse> {
    try {
      if (isSmartChannelRenderRequest(request)) {
        const result = await renderSmartChannel(request, {
          projectRoot,
          inputRoot,
          outputRoot,
          contracts,
          publish: true,
        });
        const response = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "png" && key !== "report")) as unknown as RenderResponse;
        schemas.assertResponse(response);
        return response;
      }
      if (isFreeformRenderRequest(request)) {
        const result = await renderFreeform(request, {
          projectRoot,
          inputRoot,
          outputRoot,
          contracts,
          publish: true,
        });
        const response = freeformResponseFromResult(result);
        schemas.assertResponse(response);
        return response;
      }
      return await render(request);
    } catch (error) {
      if (process.env.KBR_DEBUG === "1") {
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      }
      return failureResponse([createIssue(contracts.errorRegistry, "KBR-SYSTEM-005", "/")]);
    }
  }

  return {
    render: renderSafe,
    async renderNaverFeedCollection(request: NaverFeedCollectionRenderRequest): Promise<NaverFeedCollectionRenderResult> {
      if (!isNaverFeedCollectionRenderRequest(request)) {
        return {
          status: "BLOCKED",
          downloadAllowed: false,
          manifestDigest: null,
          manifestPath: null,
          artifactPaths: [],
          manifest: null,
          artifacts: [],
          collectionFingerprint: null,
          requestFingerprint: null,
          finalUiRendered: false,
          finalUiChecksum: null,
          partialPublish: false,
          errors: [createIssue(contracts.errorRegistry, "KBR-NAVER-SOURCE-CARDINALITY", "/artifactCardinality", { actual: "invalid collection request" })],
          warnings: [],
        };
      }
      return renderNaverFeedCollection(request, {
        projectRoot,
        inputRoot,
        outputRoot,
        contracts,
        publish: true,
      });
    },
    async renderFreeform(request: FreeformRenderRequest): Promise<FreeformRenderResult> {
      return renderFreeform(request, {
        projectRoot,
        inputRoot,
        outputRoot,
        contracts,
        publish: true,
      });
    },
    async renderJson(json: string): Promise<RenderResponse> {
      const parsed = parseJsonInput(json, contracts);
      return parsed.valid ? renderSafe(parsed.value) : failureResponse(parsed.issues);
    },
    previewInternal,
  };
}

export function assertDownloadAllowed(response: RenderResponse, contracts: ContractBundle): void {
  if (!response.downloadAllowed) {
    const issue = createIssue(contracts.errorRegistry, "KBR-DOWNLOAD-001", "/downloadAllowed");
    throw new Error(`${issue.code}:${issue.messageKey}`);
  }
}

export async function readRenderedManifest(response: RenderResponse): Promise<RenderManifest | null> {
  if (!response.downloadAllowed || response.manifestPath === null) return null;
  return JSON.parse(await readFile(response.manifestPath, "utf8")) as RenderManifest;
}

export function rendererVersion(): string {
  return RENDERER_VERSION;
}

export function contractsForTesting(contracts: ContractBundle): ContractBundle {
  return contracts;
}
