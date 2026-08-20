import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  collectActivationFailures,
  verifySemanticActivation,
  type ActivationSources,
} from "./verify-pi-2c-semantic-activation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string): string => readFileSync(path.join(root, relativePath), "utf8");
const baseSources: ActivationSources = {
  bindingSource: read("packages/infrastructure/src/render/renderer-bindings.ts"),
  adapterSource: read("packages/infrastructure/src/render/canonical-renderer-adapter.ts"),
  portSource: read("packages/infrastructure/src/render/canonical-renderer-port.ts"),
  plannerSource: read("packages/infrastructure/src/render/semantic-placement-planner.ts"),
  canonicalProductSource: read("apps/worker/src/handlers/canonical-product.ts"),
  publicSource: read("packages/renderer-vendor/src/public.ts"),
  actualE2eSource: read("apps/api/e2e/jacomo-thumbnail-semantic-product-flow.spec.ts"),
  workflowHelperSource: read("packages/testkit/src/harness/thumbnail-semantic-product-flow.ts"),
  liveRunnerSource: read("tools/pi-2c/run-real-image-semantic-e2e.ts"),
  sourceLock: JSON.parse(read("packages/renderer-vendor/SOURCE_LOCK.json")) as unknown,
};

describe("PI-2C semantic activation verifier", () => {
  it("passes the exact activated thumbnail and preserved Object Right bindings", () => {
    expect(verifySemanticActivation(baseSources)).toEqual({
      status: "PASS",
      gate: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E",
    });
  });

  it.each([
    [
      "wrong Plume format",
      "bindingSource",
      "kakao-moment-bizboard-thumbnail-box-right-1029x258",
      "wrong-format",
    ],
    [
      "wrong Renderer profile",
      "bindingSource",
      "rendererFormatProfileId: THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID",
      "rendererFormatProfileId: WRONG_RENDERER_PROFILE",
    ],
    [
      "wrong template",
      "bindingSource",
      "rendererTemplateId: THUMBNAIL_BOX_RIGHT_TEMPLATE_ID",
      "rendererTemplateId: WRONG_TEMPLATE",
    ],
    [
      "Object Right binding drift",
      "bindingSource",
      "rendererFormatProfileId: OBJECT_RIGHT_FORMAT_PROFILE_ID",
      "rendererFormatProfileId: WRONG_OBJECT_PROFILE",
    ],
    [
      "Renderer SHA drift",
      "adapterSource",
      "7baa272dd852ed21a09cf369c928571b3f75fd31",
      "0".repeat(40),
    ],
  ] as const)("rejects %s", (_label, key, from, to) => {
    const sources = { ...baseSources, [key]: baseSources[key].replace(from, to) };
    expect(collectActivationFailures(sources)).not.toEqual([]);
  });

  it("rejects thumbnail layout mode drift", () => {
    const bindingSource = baseSources.bindingSource.replace(
      'rendererTemplateId: THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,\n  layoutMode: "TEMPLATE_LOCKED"',
      'rendererTemplateId: THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,\n  layoutMode: "FREEFORM"',
    );
    expect(collectActivationFailures({ ...baseSources, bindingSource })).not.toEqual([]);
  });

  it("rejects provider or semantic inference imports in the Renderer adapter", () => {
    const adapterSource = `${baseSources.adapterSource}\nimport { planSemanticPlacement } from \"semantic-placement-planner\";`;
    expect(collectActivationFailures({ ...baseSources, adapterSource })).toContain(
      "adapter provider or semantic inference import",
    );
  });

  it("rejects a fixed six-attempt live guard", () => {
    const liveRunnerSource = `${baseSources.liveRunnerSource}\nif (providerCalls.calls !== SAMPLES.length) throw new Error();`;
    expect(collectActivationFailures({ ...baseSources, liveRunnerSource })).toContain(
      "live fixed six-attempt guard",
    );
  });

  it("rejects SOURCE_LOCK count drift", () => {
    const lock = baseSources.sourceLock as { files: unknown[] };
    expect(
      collectActivationFailures({
        ...baseSources,
        sourceLock: { ...lock, files: lock.files.slice(0, 110) },
      }),
    ).toContain("SOURCE_LOCK entry count");
  });
});
