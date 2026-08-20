import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectFreezeFailures,
  verifyFreezeManifest,
  type FreezeSources,
} from "./verify-pi-1c-kakao-canonical-freeze.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string): string =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const baseManifest = JSON.parse(read("docs/release/pi-1c-kakao-canonical-freeze.json")) as Record<
  string,
  unknown
>;

const sources: FreezeSources = {
  sourceLock: JSON.parse(read("packages/renderer-vendor/SOURCE_LOCK.json")) as unknown,
  bindingSource: read("packages/infrastructure/src/render/renderer-bindings.ts"),
  rendererContractSource: read(
    "packages/renderer-vendor/upstream/packages/renderer-contract/src/index.ts",
  ),
  asyncContractSource: read("packages/contracts/src/async.ts"),
  runtimeSource: read("apps/worker/src/handlers/jacomo-runtime.ts"),
  canonicalE2eSource: read("apps/api/e2e/jacomo-canonical-product-flow.spec.ts"),
};

function cloneManifest(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(baseManifest)) as Record<string, unknown>;
}

describe("PI-1C Kakao canonical freeze verifier", () => {
  it("passes the committed freeze against current source pins and evidence", () => {
    expect(verifyFreezeManifest(baseManifest, sources)).toEqual({
      status: "PASS",
      gate: "PI_1C_KAKAO_CANONICAL_INTEGRATION_FREEZE",
    });
  });

  it("fails when the renderer SHA drifts", () => {
    const manifest = cloneManifest();
    (manifest.renderer as Record<string, unknown>).canonicalSha = "0".repeat(64);
    const failures = collectFreezeFailures(manifest, sources);
    expect(failures.some((failure) => failure.includes("renderer.canonicalSha"))).toBe(true);
  });

  it("fails when the renderer contract or format binding drifts", () => {
    const manifest = cloneManifest();
    (manifest.renderer as Record<string, unknown>).integrationContractVersion = "0.0.0";
    (manifest.formatBinding as Record<string, unknown>).rendererTemplateId = "UNBOUND_TEMPLATE";
    const failures = collectFreezeFailures(manifest, sources);
    expect(
      failures.some((failure) => failure.includes("renderer.integrationContractVersion")),
    ).toBe(true);
    expect(failures.some((failure) => failure.includes("formatBinding.rendererTemplateId"))).toBe(
      true,
    );
  });

  it("fails when visual acceptance or the accepted checksum drifts", () => {
    const manifest = cloneManifest();
    (manifest.visualAcceptance as Record<string, unknown>).status = "PENDING";
    (manifest.acceptedArtifact as Record<string, unknown>).canonicalRenderPngSha256 = "1".repeat(
      64,
    );
    const failures = collectFreezeFailures(manifest, sources);
    expect(failures.some((failure) => failure.includes("visualAcceptance.status"))).toBe(true);
    expect(
      failures.some((failure) => failure.includes("acceptedArtifact.canonicalRenderPngSha256")),
    ).toBe(true);
  });
});
