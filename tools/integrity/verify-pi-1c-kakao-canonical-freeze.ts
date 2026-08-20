import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PI_1C_GATE = "PI_1C_KAKAO_CANONICAL_INTEGRATION_FREEZE" as const;

const EXPECTED = Object.freeze({
  sourceRepository: "knight337700-max/plume",
  parentBranch: "codex/pi-1b-real-kakao-product-e2e",
  parentCommit: "cf886bb8c0eb9cf83d0c207f9ee2376f323bdbe7",
  rendererRepository: "knight337700-max/plume-renderer",
  rendererSha: "7baa272dd852ed21a09cf369c928571b3f75fd31",
  contractVersion: "1.8.0",
  plumeFormatProfileId: "kakao-moment-bizboard-1029x258",
  rendererFormatProfileId: "KAKAO_BIZBOARD_OBJECT_RIGHT",
  rendererTemplateId: "KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1",
  imageSlotId: "OBJECT_RIGHT_PRODUCT",
  placementPolicy: "ALPHA_TRIM_CONTAIN",
  placementSource: "DETERMINISTIC",
  fitMode: "CONTAIN",
  anchor: "CENTER",
  subjectProtection: "NONE",
  renderSha256: "20dc9d62b8650a72115a8d584846399d9cd6dd2c8a0996b4889edb596feb68b1",
  pixelFingerprint: "f6690a069d861caeb90770d3f8e9304c7bba749177eda83c4222668e6f066836",
  requestFingerprint: "5c06983a8f82049c4dbb205553600009a8c170649eac76ca9d3a74b330c2548a",
  warningCode: "KBR-LAYOUT-009",
  reviewDate: "2026-08-20",
} as const);

export interface FreezeSources {
  readonly sourceLock: unknown;
  readonly bindingSource: string;
  readonly rendererContractSource: string;
  readonly asyncContractSource: string;
  readonly runtimeSource: string;
  readonly canonicalE2eSource: string;
}

export interface FreezeCheckResult {
  readonly status: "PASS" | "FAIL";
  readonly gate?: typeof PI_1C_GATE;
  readonly failures?: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function atPath(value: unknown, pathParts: readonly string[]): unknown {
  let current: unknown = value;
  for (const part of pathParts) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[part];
  }
  return current;
}

function sameValue(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireValue(
  manifest: unknown,
  failures: string[],
  pathName: string,
  expected: unknown,
): void {
  const actual = atPath(manifest, pathName.split("."));
  if (!sameValue(actual, expected)) {
    failures.push(
      `${pathName}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function requireSource(
  failures: string[],
  source: string,
  pattern: RegExp,
  description: string,
): void {
  if (!pattern.test(source)) failures.push(`source:${description}`);
}

function requireHash(
  failures: string[],
  manifest: unknown,
  pathName: string,
  expected: string,
): void {
  const actual = atPath(manifest, pathName.split("."));
  if (typeof actual !== "string" || !/^[a-f0-9]{64}$/u.test(actual) || actual !== expected) {
    failures.push(`${pathName}: accepted checksum/fingerprint drift`);
  }
}

/**
 * Validate the committed PI-1C freeze against the current source surfaces.
 * This function is pure with respect to the repository: it never rewrites
 * files and accepts source contents explicitly so drift cases can be tested.
 */
export function collectFreezeFailures(manifest: unknown, sources: FreezeSources): string[] {
  const failures: string[] = [];

  requireValue(manifest, failures, "schemaVersion", 1);
  requireValue(manifest, failures, "gate", PI_1C_GATE);
  requireValue(manifest, failures, "status", "FROZEN");

  requireValue(manifest, failures, "sourceBaseline.repository", EXPECTED.sourceRepository);
  requireValue(manifest, failures, "sourceBaseline.parentBranch", EXPECTED.parentBranch);
  requireValue(manifest, failures, "sourceBaseline.parentCommit", EXPECTED.parentCommit);
  requireValue(manifest, failures, "sourceBaseline.parentPullRequest", 23);

  requireValue(manifest, failures, "renderer.repository", EXPECTED.rendererRepository);
  requireValue(manifest, failures, "renderer.canonicalSha", EXPECTED.rendererSha);
  requireValue(manifest, failures, "renderer.integrationContractVersion", EXPECTED.contractVersion);

  const sourceLock = asRecord(sources.sourceLock);
  if (!sourceLock) {
    failures.push("SOURCE_LOCK.json: invalid JSON object");
  } else {
    if (sourceLock.repository !== EXPECTED.rendererRepository)
      failures.push("SOURCE_LOCK.json: renderer repository drift");
    if (sourceLock.commit !== EXPECTED.rendererSha)
      failures.push("SOURCE_LOCK.json: renderer commit drift");
    if (sourceLock.integrationContractVersion !== EXPECTED.contractVersion)
      failures.push("SOURCE_LOCK.json: integration contract drift");
  }

  requireValue(
    manifest,
    failures,
    "formatBinding.plumeFormatProfileId",
    EXPECTED.plumeFormatProfileId,
  );
  requireValue(
    manifest,
    failures,
    "formatBinding.rendererFormatProfileId",
    EXPECTED.rendererFormatProfileId,
  );
  requireValue(manifest, failures, "formatBinding.rendererTemplateId", EXPECTED.rendererTemplateId);
  requireValue(manifest, failures, "formatBinding.layoutMode", "TEMPLATE_LOCKED");
  requireSource(
    failures,
    sources.bindingSource,
    /PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID\s*=\s*["']kakao-moment-bizboard-1029x258["']/u,
    "Plume Kakao format binding",
  );
  requireSource(
    failures,
    sources.bindingSource,
    /rendererFormatProfileId\s*:\s*OBJECT_RIGHT_FORMAT_PROFILE_ID/u,
    "renderer format profile binding",
  );
  requireSource(
    failures,
    sources.bindingSource,
    /rendererTemplateId\s*:\s*OBJECT_RIGHT_TEMPLATE_ID/u,
    "renderer template binding",
  );
  requireSource(
    failures,
    sources.bindingSource,
    /layoutMode\s*:\s*["']TEMPLATE_LOCKED["']/u,
    "locked layout binding",
  );
  requireSource(
    failures,
    sources.rendererContractSource,
    /OBJECT_RIGHT_FORMAT_PROFILE_ID\s*=\s*["']KAKAO_BIZBOARD_OBJECT_RIGHT["']/u,
    "renderer Object Right profile",
  );
  requireSource(
    failures,
    sources.rendererContractSource,
    /OBJECT_RIGHT_TEMPLATE_ID\s*=\s*["']KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1["']/u,
    "renderer Kakao template",
  );

  requireValue(manifest, failures, "placementContract.imageSlotId", EXPECTED.imageSlotId);
  requireValue(manifest, failures, "placementContract.policy", EXPECTED.placementPolicy);
  requireValue(manifest, failures, "placementContract.source", EXPECTED.placementSource);
  requireValue(manifest, failures, "placementContract.fitMode", EXPECTED.fitMode);
  requireValue(manifest, failures, "placementContract.anchor", EXPECTED.anchor);
  requireValue(
    manifest,
    failures,
    "placementContract.subjectProtection",
    EXPECTED.subjectProtection,
  );

  requireValue(manifest, failures, "productFlow.canonicalMode", "CANONICAL_RENDERER");
  requireValue(manifest, failures, "productFlow.uploadRequired", true);
  requireValue(manifest, failures, "productFlow.confirmedBriefRequired", true);
  requireValue(manifest, failures, "productFlow.selectedAssetRequired", true);
  requireValue(manifest, failures, "productFlow.licenseStatus", "VALID");
  requireValue(manifest, failures, "productFlow.mimeType", "image/png");
  requireValue(manifest, failures, "productFlow.alphaRequired", true);
  requireValue(manifest, failures, "productFlow.legacyFallbackUsed", false);
  requireValue(manifest, failures, "productFlow.agentProviderCalls", 0);
  requireValue(manifest, failures, "productFlow.openAiCalls", 0);

  requireSource(
    failures,
    sources.asyncContractSource,
    /CANONICAL_RENDERER/u,
    "canonical generation mode contract",
  );
  requireSource(
    failures,
    sources.runtimeSource,
    /payload\.generationMode\s*===\s*["']CANONICAL_RENDERER["']/u,
    "explicit canonical mode branch",
  );
  requireSource(
    failures,
    sources.runtimeSource,
    /const canonicalResult = isCanonical/u,
    "canonical render branch",
  );
  requireSource(
    failures,
    sources.runtimeSource,
    /renderCanonicalProductDocument/u,
    "canonical renderer call",
  );
  requireSource(
    failures,
    sources.runtimeSource,
    /const rendered = canonicalResult\s*\?\s*canonicalResult\.result\s*:\s*renderCreativeDocument/u,
    "legacy renderer isolated behind canonical branch",
  );
  requireSource(
    failures,
    sources.runtimeSource,
    /legacyFallbackUsed:\s*rendererMetadata\.legacyFallbackUsed\s*\?\?\s*!isCanonical/u,
    "canonical fallback evidence",
  );

  requireHash(
    failures,
    manifest,
    "acceptedArtifact.reviewPackSha256",
    "4536f709d5c84310896ec74b157d3877e2897849b4ffef6cdc0907d20b73209b",
  );
  requireHash(
    failures,
    manifest,
    "acceptedArtifact.inputProductPngSha256",
    "fd5d6e48ebbf443f10f40af1b70091649b208bc7118f64dc3a990434915fc2fe",
  );
  requireHash(
    failures,
    manifest,
    "acceptedArtifact.canonicalRenderPngSha256",
    EXPECTED.renderSha256,
  );
  requireHash(
    failures,
    manifest,
    "acceptedArtifact.exportZipSha256",
    "46c86214f5011328ba407d20d4d233f8b088c9509390909ccfb58cf86511a1ef",
  );
  requireHash(
    failures,
    manifest,
    "acceptedArtifact.evidenceJsonSha256",
    "340ad515287e599a763d53604e9ce9b4c7922c552cfe7f23d83acf0b2627a16c",
  );
  requireHash(
    failures,
    manifest,
    "acceptedArtifact.exportEmbeddedPngSha256",
    EXPECTED.renderSha256,
  );
  requireHash(
    failures,
    manifest,
    "acceptedFingerprints.requestFingerprint",
    EXPECTED.requestFingerprint,
  );
  requireHash(
    failures,
    manifest,
    "acceptedFingerprints.pixelFingerprint",
    EXPECTED.pixelFingerprint,
  );
  requireHash(
    failures,
    manifest,
    "acceptedFingerprints.renderFingerprint",
    EXPECTED.pixelFingerprint,
  );

  requireValue(
    manifest,
    failures,
    "acceptedArtifact.reviewPackFileName",
    "PI-1B-Kakao-Review-Pack.zip",
  );
  requireValue(manifest, failures, "acceptedPlacementEvidence.imageSlotId", EXPECTED.imageSlotId);
  requireValue(manifest, failures, "acceptedPlacementEvidence.policy", EXPECTED.placementPolicy);
  requireValue(manifest, failures, "acceptedPlacementEvidence.source", EXPECTED.placementSource);
  requireValue(manifest, failures, "acceptedPlacementEvidence.appliedScale", 1.3347457627118644);
  requireValue(manifest, failures, "acceptedPlacementEvidence.appliedAnchor", EXPECTED.anchor);
  requireValue(manifest, failures, "acceptedPlacementEvidence.destinationRect", {
    x: 666,
    y: 45,
    width: 315,
    height: 167,
  });
  requireValue(manifest, failures, "acceptedPlacementEvidence.alphaTrimApplied", true);
  requireValue(manifest, failures, "acceptedPlacementEvidence.changedFromRequestedPlan", false);
  requireValue(manifest, failures, "acceptedPlacementEvidence.resolvedSourceCropPixels", {
    x: 12,
    y: 20,
    width: 236,
    height: 125,
  });

  requireValue(manifest, failures, "validationAcceptance.status", "PASS");
  requireValue(manifest, failures, "validationAcceptance.rendererErrorCount", 0);
  const acceptedWarnings = atPath(manifest, ["validationAcceptance", "acceptedWarnings"]);
  if (
    !Array.isArray(acceptedWarnings) ||
    acceptedWarnings.length !== 1 ||
    !sameValue(acceptedWarnings[0], {
      code: EXPECTED.warningCode,
      kind: "layout.object_near_slot_edge",
    })
  ) {
    failures.push("validationAcceptance.acceptedWarnings: unexpected warning set");
  }

  requireValue(manifest, failures, "visualAcceptance.status", "PASS");
  requireValue(manifest, failures, "visualAcceptance.gate", "PI_1B_REAL_KAKAO_PRODUCT_E2E");
  requireValue(
    manifest,
    failures,
    "visualAcceptance.acceptedArtifactChecksum",
    EXPECTED.renderSha256,
  );
  requireValue(manifest, failures, "visualAcceptance.acceptedWarningCode", EXPECTED.warningCode);
  requireValue(manifest, failures, "visualAcceptance.reviewDate", EXPECTED.reviewDate);
  requireValue(manifest, failures, "visualAcceptance.reviewBasis", "USER_PROVIDED_REVIEW_PACK");

  requireSource(
    failures,
    sources.canonicalE2eSource,
    /PI-1B canonical Kakao Product E2E/u,
    "dedicated canonical E2E",
  );
  requireSource(
    failures,
    sources.canonicalE2eSource,
    /generationMode:\s*["']CANONICAL_RENDERER["']/u,
    "canonical E2E mode",
  );
  requireSource(
    failures,
    sources.canonicalE2eSource,
    /20dc9d62b8650a72115a8d584846399d9cd6dd2c8a0996b4889edb596feb68b1/u,
    "canonical E2E render checksum",
  );
  requireSource(
    failures,
    sources.canonicalE2eSource,
    /f6690a069d861caeb90770d3f8e9304c7bba749177eda83c4222668e6f066836/u,
    "canonical E2E pixel fingerprint",
  );
  requireSource(
    failures,
    sources.canonicalE2eSource,
    /expect\(renderResult\.legacyFallbackUsed\)\.toBe\(false\)/u,
    "canonical E2E fail-closed assertion",
  );
  requireSource(
    failures,
    sources.canonicalE2eSource,
    /harness\.mockOpenAI\.requests\)\.toHaveLength\(0\)/u,
    "canonical E2E provider isolation",
  );

  const deferredScope = atPath(manifest, ["deferredScope"]);
  if (
    !Array.isArray(deferredScope) ||
    !deferredScope.includes("PI_2_TEMPLATE_SEMANTIC_PLACEMENT")
  ) {
    failures.push("deferredScope: PI-2 semantic placement is not explicitly deferred");
  }

  return failures;
}

export function verifyFreezeManifest(manifest: unknown, sources: FreezeSources): FreezeCheckResult {
  const failures = collectFreezeFailures(manifest, sources);
  return failures.length > 0 ? { status: "FAIL", failures } : { status: "PASS", gate: PI_1C_GATE };
}

function readRepositorySources(repositoryRoot: string): {
  manifest: unknown;
  sources: FreezeSources;
} {
  const read = (relativePath: string): string =>
    readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  return {
    manifest: JSON.parse(read("docs/release/pi-1c-kakao-canonical-freeze.json")) as unknown,
    sources: {
      sourceLock: JSON.parse(read("packages/renderer-vendor/SOURCE_LOCK.json")) as unknown,
      bindingSource: read("packages/infrastructure/src/render/renderer-bindings.ts"),
      rendererContractSource: read(
        "packages/renderer-vendor/upstream/packages/renderer-contract/src/index.ts",
      ),
      asyncContractSource: read("packages/contracts/src/async.ts"),
      runtimeSource: read("apps/worker/src/handlers/jacomo-runtime.ts"),
      canonicalE2eSource: read("apps/api/e2e/jacomo-canonical-product-flow.spec.ts"),
    },
  };
}

function isMainModule(): boolean {
  return (
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const { manifest, sources } = readRepositorySources(repositoryRoot);
    const result = verifyFreezeManifest(manifest, sources);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "FAIL") process.exitCode = 1;
  } catch (error) {
    const result: FreezeCheckResult = {
      status: "FAIL",
      failures: [`verifier_error:${error instanceof Error ? error.message : String(error)}`],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}
