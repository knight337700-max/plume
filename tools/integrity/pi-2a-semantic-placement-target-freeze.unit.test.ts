import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectFreezeFailures,
  verifyFreezeManifest,
  type FreezeSources,
} from "./verify-pi-2a-semantic-placement-target-freeze.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string): string =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const evidencePaths = [
  "tests/integration-contract/thumbnail-box-right.test.ts",
  "fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
  "fixtures/golden/thumbnail-box-right__valid__golden.png",
] as const;

const evidence = Object.fromEntries(
  evidencePaths.map((relativePath) => {
    const bytes = readFileSync(
      path.join(repositoryRoot, "packages/renderer-vendor/upstream", relativePath),
    );
    return [
      relativePath,
      { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") },
    ];
  }),
);

const baseManifest = JSON.parse(
  read("docs/release/pi-2a-semantic-placement-target-freeze.json"),
) as Record<string, unknown>;

const baseSources: FreezeSources = {
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
};

function cloneManifest(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(baseManifest)) as Record<string, unknown>;
}

function cloneSources(): FreezeSources {
  return {
    ...baseSources,
    sourceLock: JSON.parse(JSON.stringify(baseSources.sourceLock)) as unknown,
    evidence: { ...baseSources.evidence },
  };
}

function recordAt(manifest: Record<string, unknown>, ...parts: string[]): Record<string, unknown> {
  let current: unknown = manifest;
  for (const part of parts) {
    const record = current as Record<string, unknown>;
    current = record[part];
  }
  return current as Record<string, unknown>;
}

describe("PI-2A semantic placement target freeze verifier", () => {
  it("passes the committed target freeze against the pinned renderer evidence", () => {
    expect(verifyFreezeManifest(baseManifest, baseSources)).toEqual({
      status: "PASS",
      gate: "PI_2A_TEMPLATE_SEMANTIC_PLACEMENT_TARGET_FREEZE",
    });
  });

  it("rejects historical manifest SOURCE_LOCK snapshot drift", () => {
    const manifest = cloneManifest();
    recordAt(manifest, "vendorEvidence").sourceLockEntries = 999;
    const failures = collectFreezeFailures(manifest, baseSources);
    expect(failures.some((failure) => failure.includes("vendorEvidence.sourceLockEntries"))).toBe(
      true,
    );
  });

  it.each([
    [
      "wrong parent SHA",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "sourceBaseline").commit = "0".repeat(40);
      },
      "sourceBaseline.commit",
    ],
    [
      "wrong Renderer SHA",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "renderer").commit = "0".repeat(40);
      },
      "renderer.commit",
    ],
    [
      "wrong target profile",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "targetProfile").id = "WRONG";
      },
      "targetProfile.id",
    ],
    [
      "semantic placement drift",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "targetProfile").semanticPlacement = "OPTIONAL";
      },
      "targetProfile.semanticPlacement",
    ],
    [
      "layout mode drift",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "targetProfile").layoutMode = "FREEFORM";
      },
      "targetProfile.layoutMode",
    ],
    [
      "agent placement support drift",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "targetProfile").supportsAgentPlacement = false;
      },
      "targetProfile.supportsAgentPlacement",
    ],
    [
      "wrong slot geometry",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "rendererGeometry").imageSlot = {
          id: "IMAGE_PRIMARY",
          x: 0,
          y: 36,
          width: 315,
          height: 186,
          radius: 12,
        };
      },
      "rendererGeometry.imageSlot",
    ],
    [
      "wrong slot ID",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "targetProfile").imageSlotIds = ["IMAGE_SECONDARY"];
      },
      "targetProfile.imageSlotIds",
    ],
    [
      "wrong subject protection",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "acceptedPlanIntent").subjectProtection = "NONE";
      },
      "acceptedPlanIntent.subjectProtection",
    ],
    [
      "candidate cardinality drift",
      (manifest: Record<string, unknown>) => {
        recordAt(manifest, "initialCandidateCardinality").maximum = 2;
      },
      "initialCandidateCardinality",
    ],
  ] as const)("rejects %s", (_label, mutate, expectedFailure) => {
    const manifest = cloneManifest();
    mutate(manifest);
    const failures = collectFreezeFailures(manifest, baseSources);
    expect(failures.some((failure) => failure.includes(expectedFailure))).toBe(true);
  });

  it("allows an unrelated additive source-lock entry", () => {
    const sources = cloneSources();
    const sourceLock = sources.sourceLock as { files: unknown[] };
    sourceLock.files = [
      ...sourceLock.files,
      { path: "contracts/synthetic-unrelated-entry.json", bytes: 1, sha256: "0".repeat(64) },
    ];
    const failures = collectFreezeFailures(baseManifest, sources);
    expect(failures).toEqual([]);
  });

  it("rejects a missing required source-lock entry", () => {
    const sources = cloneSources();
    const sourceLock = sources.sourceLock as { files: unknown[] };
    sourceLock.files = sourceLock.files.filter(
      (entry) => (entry as { path?: unknown }).path !== evidencePaths[0],
    );
    const failures = collectFreezeFailures(baseManifest, sources);
    expect(failures).toContain(`SOURCE_LOCK.json.files.${evidencePaths[0]}: missing`);
  });

  it("rejects required source-lock entry digest drift", () => {
    const sources = cloneSources();
    const sourceLock = sources.sourceLock as { files: unknown[] };
    const entry = sourceLock.files.find(
      (value) => (value as { path?: unknown }).path === evidencePaths[1],
    ) as { sha256: string } | undefined;
    if (!entry) throw new Error("Required SOURCE_LOCK fixture missing in test setup");
    entry.sha256 = "0".repeat(64);
    const failures = collectFreezeFailures(baseManifest, sources);
    expect(failures).toContain(`SOURCE_LOCK.json.files.${evidencePaths[1]}: digest or byte drift`);
  });

  it.each([
    ["repository", "wrong-repository", "SOURCE_LOCK.json: renderer repository drift"],
    ["commit", "0".repeat(40), "SOURCE_LOCK.json: renderer commit drift"],
    ["integrationContractVersion", "0.0.0", "SOURCE_LOCK.json: integration contract drift"],
  ] as const)("rejects SOURCE_LOCK %s drift", (field, value, expectedFailure) => {
    const sources = cloneSources();
    const sourceLock = sources.sourceLock as Record<string, unknown> & { files: unknown[] };
    sourceLock[field] = value;
    expect(collectFreezeFailures(baseManifest, sources)).toContain(expectedFailure);
  });

  it("rejects missing and mismatched evidence digests", () => {
    const missing = cloneSources();
    const missingEvidence = { ...missing.evidence };
    delete missingEvidence[evidencePaths[0]];
    const missingFailures = collectFreezeFailures(baseManifest, {
      ...missing,
      evidence: missingEvidence,
    });
    expect(
      missingFailures.some((failure) => failure.includes("evidence.tests/integration-contract")),
    ).toBe(true);

    const mismatched = cloneSources();
    const mismatchedEvidence = { ...mismatched.evidence };
    const original = mismatchedEvidence[evidencePaths[1]];
    if (!original) throw new Error("Evidence fixture missing in test setup");
    mismatchedEvidence[evidencePaths[1]] = { ...original, sha256: "0".repeat(64) };
    const mismatchFailures = collectFreezeFailures(baseManifest, {
      ...mismatched,
      evidence: mismatchedEvidence,
    });
    expect(mismatchFailures.some((failure) => failure.includes("digest or byte drift"))).toBe(true);
  });
});
