import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PI_2C_GATE = "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E" as const;

const EXPECTED = Object.freeze({
  plumeFormatProfileId: "kakao-moment-bizboard-thumbnail-box-right-1029x258",
  rendererFormatProfileId: "KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT",
  rendererTemplateId: "KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT",
  layoutMode: "TEMPLATE_LOCKED",
  imageSlotId: "IMAGE_PRIMARY",
  objectPlumeFormatProfileId: "kakao-moment-bizboard-1029x258",
  objectRendererFormatProfileId: "KAKAO_BIZBOARD_OBJECT_RIGHT",
  objectRendererTemplateId: "KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1",
  rendererRepository: "knight337700-max/plume-renderer",
  rendererSha: "7baa272dd852ed21a09cf369c928571b3f75fd31",
  contract: "1.8.0",
  sourceLockEntries: 111,
} as const);

export interface ActivationSources {
  readonly bindingSource: string;
  readonly adapterSource: string;
  readonly portSource: string;
  readonly plannerSource: string;
  readonly canonicalProductSource: string;
  readonly publicSource: string;
  readonly actualE2eSource: string;
  readonly workflowHelperSource: string;
  readonly liveRunnerSource: string;
  readonly sourceLock: unknown;
}

export interface ActivationCheckResult {
  readonly status: "PASS" | "FAIL";
  readonly gate?: typeof PI_2C_GATE;
  readonly failures?: readonly string[];
}

function requireMatch(failures: string[], source: string, pattern: RegExp, name: string): void {
  if (!pattern.test(source)) failures.push(name);
}

function sourceLockCount(sourceLock: unknown): number | undefined {
  if (!sourceLock || typeof sourceLock !== "object" || Array.isArray(sourceLock)) return undefined;
  const files = (sourceLock as { readonly files?: unknown }).files;
  return Array.isArray(files) ? files.length : undefined;
}

export function collectActivationFailures(sources: ActivationSources): readonly string[] {
  const failures: string[] = [];
  requireMatch(
    failures,
    sources.bindingSource,
    /PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID\s*=\s*"kakao-moment-bizboard-thumbnail-box-right-1029x258"/u,
    "thumbnail Plume format",
  );
  requireMatch(
    failures,
    sources.bindingSource,
    /THUMBNAIL_BOX_RIGHT_FORMAT_BINDING\s*:\s*CanonicalRendererFormatBinding\s*=\s*Object\.freeze\(\{[\s\S]*?plumeFormatProfileId:\s*PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,[\s\S]*?rendererFormatProfileId:\s*THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,[\s\S]*?rendererTemplateId:\s*THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,[\s\S]*?layoutMode:\s*"TEMPLATE_LOCKED"/u,
    "thumbnail exact binding",
  );
  requireMatch(
    failures,
    sources.bindingSource,
    /THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID/u,
    "thumbnail Renderer profile",
  );
  requireMatch(
    failures,
    sources.bindingSource,
    /THUMBNAIL_BOX_RIGHT_TEMPLATE_ID/u,
    "thumbnail template",
  );
  requireMatch(
    failures,
    sources.bindingSource,
    /layoutMode:\s*"TEMPLATE_LOCKED"/u,
    "thumbnail layout mode",
  );

  requireMatch(
    failures,
    sources.bindingSource,
    /OBJECT_RIGHT_FORMAT_BINDING\s*:\s*CanonicalRendererFormatBinding\s*=\s*Object\.freeze\(\{[\s\S]*?plumeFormatProfileId:\s*PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,[\s\S]*?rendererFormatProfileId:\s*OBJECT_RIGHT_FORMAT_PROFILE_ID,[\s\S]*?rendererTemplateId:\s*OBJECT_RIGHT_TEMPLATE_ID,[\s\S]*?layoutMode:\s*"TEMPLATE_LOCKED"/u,
    "Object Right binding unchanged",
  );
  requireMatch(
    failures,
    sources.adapterSource,
    new RegExp(EXPECTED.rendererSha, "u"),
    "Renderer SHA",
  );
  requireMatch(failures, sources.adapterSource, /INTEGRATION_SCHEMA_VERSION/u, "Renderer contract");
  requireMatch(failures, sources.adapterSource, /renderThumbnailBoxRight/u, "thumbnail callback");
  if (/(openai-gateway|planSemanticPlacement|AgentProviderGateway)/iu.test(sources.adapterSource))
    failures.push("adapter provider or semantic inference import");
  requireMatch(failures, sources.portSource, /semanticPlacement\?/u, "semantic renderer request");
  requireMatch(
    failures,
    sources.plannerSource,
    /readonly asset:/u,
    "required singular planner asset",
  );
  if (/readonly assets\?: readonly ThumbnailSemanticPlacementAsset/u.test(sources.plannerSource))
    failures.push("planner plural asset ambiguity");
  requireMatch(
    failures,
    sources.canonicalProductSource,
    /planSemanticPlacement/u,
    "generate semantic Agent seam",
  );
  requireMatch(
    failures,
    sources.canonicalProductSource,
    /validateSemanticPlacementEvidence/u,
    "render evidence guard",
  );
  requireMatch(
    failures,
    sources.publicSource,
    /renderThumbnailBoxRight/u,
    "frozen thumbnail public wrapper",
  );
  requireMatch(
    failures,
    sources.actualE2eSource,
    /startProcessHarness/u,
    "actual API process harness",
  );
  requireMatch(
    failures,
    sources.actualE2eSource,
    /runThumbnailSemanticProductWorkflow/u,
    "actual API workflow helper",
  );
  requireMatch(
    failures,
    sources.workflowHelperSource,
    /generation-requests/u,
    "actual generation request route",
  );
  if (
    /composeCanonicalProductCreative|renderCanonicalProductDocument|runDeterministicValidation|buildExportPackage/iu.test(
      sources.actualE2eSource,
    )
  )
    failures.push("actual API E2E directly invokes worker helpers");
  requireMatch(failures, sources.liveRunnerSource, /startProcessHarness/u, "live process harness");
  requireMatch(
    failures,
    sources.liveRunnerSource,
    /runThumbnailSemanticProductWorkflow/u,
    "live actual API workflow",
  );
  if (
    /composeCanonicalProductCreative|renderCanonicalProductDocument|runDeterministicValidation/iu.test(
      sources.liveRunnerSource,
    )
  )
    failures.push("live runner directly invokes worker helpers");
  if (sourceLockCount(sources.sourceLock) !== EXPECTED.sourceLockEntries)
    failures.push("SOURCE_LOCK entry count");
  return Object.freeze(failures);
}

export function verifySemanticActivation(sources: ActivationSources): ActivationCheckResult {
  const failures = collectActivationFailures(sources);
  return failures.length ? { status: "FAIL", failures } : { status: "PASS", gate: PI_2C_GATE };
}

function repositoryRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function readRepositorySources(root: string): ActivationSources {
  const read = (relativePath: string): string =>
    readFileSync(path.join(root, relativePath), "utf8");
  return {
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifySemanticActivation(readRepositorySources(repositoryRoot()));
  if (result.status === "PASS") console.log(`${PI_2C_GATE}_ACTIVATION_PASS`);
  else {
    console.error(`${PI_2C_GATE}_ACTIVATION_BLOCKED`);
    for (const failure of result.failures ?? []) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}
