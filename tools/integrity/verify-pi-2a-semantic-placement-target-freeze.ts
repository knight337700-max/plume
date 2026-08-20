import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PI_2A_GATE = "PI_2A_TEMPLATE_SEMANTIC_PLACEMENT_TARGET_FREEZE" as const;

const EXPECTED = Object.freeze({
  sourceRepository: "knight337700-max/plume",
  parentCommit: "88cb3b415c189181d0b970e700bcb5654359f48e",
  parentGate: "PI_2A0_RENDERER_VENDOR_EVIDENCE_SYNC",
  rendererRepository: "knight337700-max/plume-renderer",
  rendererSha: "7baa272dd852ed21a09cf369c928571b3f75fd31",
  contractVersion: "1.8.0",
  sourceLockEntries: 111,
  targetProfile: "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT",
  templateId: "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT",
  imageSlotId: "IMAGE_PRIMARY",
  plumeFormatId: "kakao-moment-bizboard-thumbnail-box-right-1029x258",
} as const);

const REQUIRED_EVIDENCE = Object.freeze([
  {
    path: "tests/integration-contract/thumbnail-box-right.test.ts",
    bytes: 9381,
    sha256: "c186ae8e3961f0b30bc7abfafb0d95261eb92a2c0874256669b70f8f79daa081",
  },
  {
    path: "fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
    bytes: 1176,
    sha256: "fd5d6e48ebbf443f10f40af1b70091649b208bc7118f64dc3a990434915fc2fe",
  },
  {
    path: "fixtures/golden/thumbnail-box-right__valid__golden.png",
    bytes: 11884,
    sha256: "f1111ee8f36fe1d8ccc7aaa445b175906e8a6432027d3e65764158ad40c52996",
  },
] as const);

const FAIL_CLOSED_ERRORS = Object.freeze([
  "KBR-CROP-RECT-REQUIRED",
  "KBR-CROP-CANDIDATE-NOT-FOUND",
  "KBR-CROP-CANDIDATE-MISMATCH",
  "KBR-CROP-RECT-OUT-OF-BOUNDS",
  "KBR-PROTECTED-SUBJECT-DATA-MISSING",
  "KBR-PROTECTED-SUBJECT-CLIPPED",
  "KBR-PLACEMENT-POLICY-NOT-ALLOWED",
  "KBR-ASSET-MIME-NOT-ALLOWED",
  "KBR-TEMPLATE-CONSTRAINT-VIOLATION",
] as const);

type JsonRecord = Record<string, unknown>;

export interface EvidenceDigest {
  readonly bytes: number;
  readonly sha256: string;
}

export interface FreezeSources {
  readonly sourceLock: unknown;
  readonly capabilitySource: string;
  readonly thumbnailSource: string;
  readonly geometrySource: string;
  readonly constantsSource: string;
  readonly bindingSource: string;
  readonly publicSource: string;
  readonly evidence: Readonly<Record<string, EvidenceDigest>>;
}

export interface FreezeCheckResult {
  readonly status: "PASS" | "FAIL";
  readonly gate?: typeof PI_2A_GATE;
  readonly failures?: readonly string[];
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
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

function requireIncludes(
  manifest: unknown,
  failures: string[],
  pathName: string,
  expectedValues: readonly string[],
): void {
  const actual = atPath(manifest, pathName.split("."));
  if (!Array.isArray(actual) || expectedValues.some((value) => !actual.includes(value))) {
    failures.push(`${pathName}: expected values are missing`);
  }
}

function requireEvidence(
  failures: string[],
  sources: FreezeSources,
  sourceLock: JsonRecord | undefined,
): void {
  const files = sourceLock?.files;
  if (!Array.isArray(files)) {
    failures.push("SOURCE_LOCK.json.files: expected an array");
  } else {
    if (files.length !== EXPECTED.sourceLockEntries) {
      failures.push(
        `SOURCE_LOCK.json.files: expected ${EXPECTED.sourceLockEntries}, received ${files.length}`,
      );
    }
    for (const expected of REQUIRED_EVIDENCE) {
      const entry = files.find((value) => asRecord(value)?.path === expected.path);
      const record = asRecord(entry);
      if (!record) {
        failures.push(`SOURCE_LOCK.json.files.${expected.path}: missing`);
        continue;
      }
      if (record.bytes !== expected.bytes || record.sha256 !== expected.sha256) {
        failures.push(`SOURCE_LOCK.json.files.${expected.path}: digest or byte drift`);
      }
    }
  }

  for (const expected of REQUIRED_EVIDENCE) {
    const actual = sources.evidence[expected.path];
    if (!actual) {
      failures.push(`evidence.${expected.path}: missing`);
      continue;
    }
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      failures.push(`evidence.${expected.path}: digest or byte drift`);
    }
  }
}

function requireCapabilitySource(failures: string[], source: string): void {
  requireSource(
    failures,
    source,
    /export const THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID = "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT"/u,
    "thumbnail format profile constant",
  );
  requireSource(
    failures,
    source,
    /export const THUMBNAIL_BOX_RIGHT_TEMPLATE_ID = "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT"/u,
    "thumbnail template constant",
  );
  requireSource(
    failures,
    source,
    /export const THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID = "IMAGE_PRIMARY"/u,
    "thumbnail image slot constant",
  );

  const capabilityMatch = source.match(
    /KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT:\s*Object\.freeze\(\{([\s\S]*?)\}\),\s*KAKAO_BIZBOARD_THUMBNAIL_MULTI_RIGHT/u,
  );
  const capability = capabilityMatch?.[1] ?? "";
  if (!capability) {
    failures.push("source:thumbnail capability entry");
    return;
  }
  const expectedCapabilityFields: readonly [RegExp, string][] = [
    [/channelNamespace:\s*"KAKAO_MOMENT"/u, "thumbnail channel namespace"],
    [/compositionMode:\s*"RENDERER_COMPOSED"/u, "thumbnail composition mode"],
    [/layoutMode:\s*"TEMPLATE_LOCKED"/u, "thumbnail layout mode"],
    [/artifactCardinality:\s*"SINGLE"/u, "thumbnail artifact cardinality"],
    [/implementationStatus:\s*"IMPLEMENTED"/u, "thumbnail implementation status"],
    [/defaultPolicy:\s*"SEMANTIC_CROP_COVER"/u, "thumbnail default policy"],
    [/semanticPlacement:\s*"REQUIRED"/u, "thumbnail semantic placement"],
    [
      /allowedPolicies:\s*\["SEMANTIC_CROP_COVER",\s*"MANUAL_CROP"\]/u,
      "thumbnail allowed policies",
    ],
    [/supportsManualCrop:\s*true/u, "thumbnail manual crop support"],
    [/supportsAgentPlacement:\s*true/u, "thumbnail agent placement support"],
    [/imageSlotIds:\s*\[THUMBNAIL_BOX_RIGHT_IMAGE_SLOT_ID\]/u, "thumbnail image slot list"],
    [/allowedInputMimeTypes:\s*\["image\/png",\s*"image\/jpeg"\]/u, "thumbnail input MIME types"],
    [/alphaChannelRequired:\s*false/u, "thumbnail alpha requirement"],
  ];
  for (const [pattern, description] of expectedCapabilityFields) {
    requireSource(failures, capability, pattern, description);
  }
}

function requireGeometrySources(failures: string[], sources: FreezeSources): void {
  const slotMatch = sources.geometrySource.match(
    /export const THUMBNAIL_BOX_RIGHT_SLOT = Object\.freeze\(\{([\s\S]*?)\}\);/u,
  );
  const slot = slotMatch?.[1] ?? "";
  if (!slot) failures.push("source:thumbnail slot geometry");
  const expectedSlot: readonly [RegExp, string][] = [
    [/x:\s*666/u, "thumbnail slot x"],
    [/y:\s*36/u, "thumbnail slot y"],
    [/width:\s*315/u, "thumbnail slot width"],
    [/height:\s*186/u, "thumbnail slot height"],
  ];
  for (const [pattern, description] of expectedSlot)
    requireSource(failures, slot, pattern, description);
  requireSource(
    failures,
    sources.geometrySource,
    /export const THUMBNAIL_BOX_RIGHT_RADIUS = 12/u,
    "thumbnail slot radius",
  );
  requireSource(
    failures,
    sources.constantsSource,
    /export const CANVAS_WIDTH = 1029/u,
    "canvas width",
  );
  requireSource(
    failures,
    sources.constantsSource,
    /export const CANVAS_HEIGHT = 258/u,
    "canvas height",
  );
  requireSource(
    failures,
    sources.thumbnailSource,
    /destinationRect:\s*THUMBNAIL_BOX_RIGHT_SLOT/u,
    "renderer destination geometry",
  );
  requireSource(
    failures,
    sources.thumbnailSource,
    /appliedScale:\s*scale/u,
    "renderer applied scale evidence",
  );
  requireSource(
    failures,
    sources.thumbnailSource,
    /resolvedSourceCropPixels:\s*cropPixels/u,
    "renderer crop pixel evidence",
  );
  requireSource(
    failures,
    sources.thumbnailSource,
    /THUMBNAIL_BOX_RIGHT_SLOT\.width\s*\/\s*cropPixels\.width[\s\S]*THUMBNAIL_BOX_RIGHT_SLOT\.height\s*\/\s*cropPixels\.height/u,
    "renderer source-pixel cover scale",
  );
}

export function collectFreezeFailures(manifest: unknown, sources: FreezeSources): string[] {
  const failures: string[] = [];

  requireValue(manifest, failures, "schemaVersion", "1.0.0");
  requireValue(manifest, failures, "gate", PI_2A_GATE);
  requireValue(manifest, failures, "status", "FROZEN_TARGET");

  requireValue(manifest, failures, "sourceBaseline.repository", EXPECTED.sourceRepository);
  requireValue(manifest, failures, "sourceBaseline.commit", EXPECTED.parentCommit);
  requireValue(manifest, failures, "sourceBaseline.parentGate", EXPECTED.parentGate);
  requireValue(manifest, failures, "renderer.repository", EXPECTED.rendererRepository);
  requireValue(manifest, failures, "renderer.commit", EXPECTED.rendererSha);
  requireValue(manifest, failures, "renderer.integrationContract", EXPECTED.contractVersion);
  requireValue(manifest, failures, "vendorEvidence.sourceLockEntries", EXPECTED.sourceLockEntries);

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
  requireEvidence(failures, sources, sourceLock);
  requireValue(
    manifest,
    failures,
    "vendorEvidence.requiredFiles",
    REQUIRED_EVIDENCE.map(({ path: evidencePath, sha256 }) => ({ path: evidencePath, sha256 })),
  );

  requireValue(manifest, failures, "targetProfile.id", EXPECTED.targetProfile);
  requireValue(manifest, failures, "targetProfile.implementationStatus", "IMPLEMENTED");
  requireValue(manifest, failures, "targetProfile.channelNamespace", "KAKAO_MOMENT");
  requireValue(manifest, failures, "targetProfile.compositionMode", "RENDERER_COMPOSED");
  requireValue(manifest, failures, "targetProfile.layoutMode", "TEMPLATE_LOCKED");
  requireValue(manifest, failures, "targetProfile.artifactCardinality", "SINGLE");
  requireValue(manifest, failures, "targetProfile.defaultPolicy", "SEMANTIC_CROP_COVER");
  requireValue(manifest, failures, "targetProfile.semanticPlacement", "REQUIRED");
  requireValue(manifest, failures, "targetProfile.allowedPolicies", [
    "SEMANTIC_CROP_COVER",
    "MANUAL_CROP",
  ]);
  requireValue(manifest, failures, "targetProfile.supportsManualCrop", true);
  requireValue(manifest, failures, "targetProfile.supportsAgentPlacement", true);
  requireValue(manifest, failures, "targetProfile.imageSlotIds", [EXPECTED.imageSlotId]);
  requireValue(manifest, failures, "targetProfile.allowedInputMimeTypes", [
    "image/png",
    "image/jpeg",
  ]);
  requireValue(manifest, failures, "targetProfile.alphaChannelRequired", false);

  requireValue(manifest, failures, "rendererTemplate.id", EXPECTED.templateId);
  requireValue(manifest, failures, "rendererTemplate.imageSlotId", EXPECTED.imageSlotId);
  requireValue(manifest, failures, "rendererTemplate.plumeFutureFormatId", EXPECTED.plumeFormatId);
  requireValue(manifest, failures, "rendererTemplate.activation", "SELECTION_CONTRACT_ONLY");
  requireValue(manifest, failures, "rejectedFirstTargets", [
    {
      id: "KAKAO_BIZBOARD_THUMBNAIL_MULTI_RIGHT",
      reason: "requires IMAGE_PRIMARY and IMAGE_SECONDARY semantic slots",
    },
    {
      id: "KAKAO_BIZBOARD_MASK_SEMICIRCLE_RIGHT",
      reason: "adds optional LOGO_PRIMARY and mask variables",
    },
  ]);

  requireValue(manifest, failures, "rendererGeometry.canvas", { width: 1029, height: 258 });
  requireValue(manifest, failures, "rendererGeometry.imageSlot", {
    id: EXPECTED.imageSlotId,
    x: 666,
    y: 36,
    width: 315,
    height: 186,
    radius: 12,
  });
  requireValue(
    manifest,
    failures,
    "rendererGeometry.semanticCropAspectSource",
    "SOURCE_IMAGE_PIXEL_DIMENSIONS",
  );

  requireValue(manifest, failures, "semanticAuthoringBoundary.rendererCallsAgent", false);
  requireValue(manifest, failures, "layoutPlanner.agent", "LAYOUT_PLANNER");
  requireValue(manifest, failures, "layoutPlanner.mode", "CONSTRAINED_SEMANTIC_PLACEMENT");
  requireValue(manifest, failures, "layoutPlanner.creativeLayoutPlanUsed", false);
  requireValue(manifest, failures, "initialCandidateCardinality", { minimum: 1, maximum: 1 });
  requireValue(manifest, failures, "acceptedPlanIntent.schemaVersion", EXPECTED.contractVersion);
  requireValue(manifest, failures, "acceptedPlanIntent.imageSlotId", EXPECTED.imageSlotId);
  requireValue(manifest, failures, "acceptedPlanIntent.policy", "SEMANTIC_CROP_COVER");
  requireValue(manifest, failures, "acceptedPlanIntent.source", "AGENT");
  requireValue(manifest, failures, "acceptedPlanIntent.fitMode", "COVER");
  requireValue(manifest, failures, "acceptedPlanIntent.anchor", "CENTER");
  requireValue(manifest, failures, "acceptedPlanIntent.subjectProtection", "REQUIRED");
  requireValue(manifest, failures, "acceptedPlanIntent.candidateReferenceRequired", true);
  requireValue(manifest, failures, "acceptedPlanIntent.cropRectForbiddenWithCandidate", true);
  requireValue(manifest, failures, "subjectPolicy.primarySubjectType", "PRODUCT");
  requireValue(manifest, failures, "subjectPolicy.subjectProtection", "REQUIRED");
  requireValue(manifest, failures, "subjectPolicy.clippedPrimarySubjectAllowed", false);
  requireValue(manifest, failures, "subjectPolicy.missingSubjectDataAction", "BLOCKED");
  requireValue(manifest, failures, "initialCandidateCardinality.minimum", 1);
  requireValue(manifest, failures, "initialCandidateCardinality.maximum", 1);

  requireValue(manifest, failures, "inputOutputContract.inputMimeTypes", [
    "image/png",
    "image/jpeg",
  ]);
  requireValue(manifest, failures, "inputOutputContract.alphaChannelRequired", false);
  requireValue(manifest, failures, "inputOutputContract.outputMimeType", "image/png");
  requireValue(manifest, failures, "inputOutputContract.outputWidth", 1029);
  requireValue(manifest, failures, "inputOutputContract.outputHeight", 258);
  requireValue(manifest, failures, "inputOutputContract.outputColorType", "RGBA");
  requireValue(manifest, failures, "failClosed.errors", FAIL_CLOSED_ERRORS);
  requireValue(manifest, failures, "failClosed.semanticPlacementFailure", "BLOCKED");
  requireValue(manifest, failures, "failClosed.fallbackAllowed", false);
  requireValue(manifest, failures, "failClosed.autoClampAllowed", false);
  requireValue(manifest, failures, "failClosed.severityChangesAllowed", false);

  requireIncludes(manifest, failures, "deferredScope", [
    "PI_2B_IMAGE_INPUT_AND_SEMANTIC_CROP_CANDIDATE",
    "PI_2C_REAL_IMAGE_E2E",
    "thumbnail runtime binding",
    "Agent imageInputs transport",
  ]);
  for (const invariant of [
    "activeThumbnailBindingAdded",
    "rendererPublicSurfaceChanged",
    "imageInputsChanged",
    "agentsChanged",
    "semanticRuntimeChanged",
    "rendererRepositoryChanged",
    "vendorUpstreamChanged",
    "pi1PixelsChanged",
    "samplePackCommitted",
    "runtimeBehaviorChanged",
  ]) {
    requireValue(manifest, failures, `invariants.${invariant}`, false);
  }

  requireCapabilitySource(failures, sources.capabilitySource);
  requireGeometrySources(failures, sources);
  // PI-2A froze the target before runtime activation.  PI-2C intentionally
  // activates the already-frozen thumbnail binding and public wrapper, so the
  // old non-activation assertions are temporal guards rather than invariants
  // of the target itself.  The historical manifest and all renderer evidence
  // above remain mandatory.

  return failures;
}

export function verifyFreezeManifest(manifest: unknown, sources: FreezeSources): FreezeCheckResult {
  const failures = collectFreezeFailures(manifest, sources);
  return failures.length > 0 ? { status: "FAIL", failures } : { status: "PASS", gate: PI_2A_GATE };
}

function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readRepositorySources(repositoryRoot: string): {
  manifest: unknown;
  sources: FreezeSources;
} {
  const read = (relativePath: string): string =>
    readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const evidence: Record<string, EvidenceDigest> = {};
  for (const required of REQUIRED_EVIDENCE) {
    const bytes = readFileSync(
      path.join(repositoryRoot, "packages/renderer-vendor/upstream", required.path),
    );
    evidence[required.path] = { bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  }
  return {
    manifest: JSON.parse(
      read("docs/release/pi-2a-semantic-placement-target-freeze.json"),
    ) as unknown,
    sources: {
      sourceLock: JSON.parse(read("packages/renderer-vendor/SOURCE_LOCK.json")) as unknown,
      capabilitySource: read(
        "packages/renderer-vendor/upstream/packages/renderer-contract/src/index.ts",
      ),
      thumbnailSource: read("packages/renderer-vendor/upstream/src/core/thumbnail-box-right.ts"),
      geometrySource: read("packages/renderer-vendor/upstream/src/core/thumbnail-box-right.ts"),
      constantsSource: read("packages/renderer-vendor/upstream/src/core/constants.ts"),
      bindingSource: read("packages/infrastructure/src/render/renderer-bindings.ts"),
      publicSource: read("packages/renderer-vendor/src/public.ts"),
      evidence,
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
