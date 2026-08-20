import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import type { AgentProviderGateway } from "../../packages/core/src/agents/orchestrator.js";
import { createInMemoryClientBrandRepositories } from "../../packages/core/src/modules/client-brand/repositories.js";
import { createOpenAIProviderRuntime } from "../../packages/infrastructure/src/ai/provider-runtime.js";
import { createLiveSmokePricingPolicy } from "../../packages/infrastructure/src/async/live-smoke-spend-policy.js";
import { PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID } from "../../packages/infrastructure/src/render/renderer-bindings.js";
import { inspectImageBytes } from "../../packages/renderer-vendor/src/public.js";
import { createJacomoFixture } from "../../packages/testkit/src/factories/jacomo-factory.js";
import { seedJacomoFixture } from "../../packages/testkit/src/fixtures/jacomo.js";
import { startProcessHarness } from "../../packages/testkit/src/harness/process-harness.js";
import {
  runThumbnailSemanticProductWorkflow,
  type ProviderCallCounter,
  type ThumbnailSemanticWorkflowResult,
} from "../../packages/testkit/src/harness/thumbnail-semantic-product-flow.js";
import { buildExportPackage } from "../../packages/infrastructure/src/export/build-package.js";

const execFile = promisify(execFileCallback);
const SAMPLE_ZIP =
  "C:/Users/Lenovo/Desktop/Ogilvy/evidence/PI-2_semantic_placement_sample_images.zip";
const EXPECTED_ZIP_SHA256 = "91d594149c8fb69dc4835110393b44269d57ef3f1fbbfc56e26382f1e9db5fed";
const REVIEW_ROOT = "C:/Users/Lenovo/Desktop/Ogilvy/evidence/pi-2c-review";
const REVIEW_PACK_NAME = "PI-2C-Thumbnail-Semantic-Review-Pack.zip";
const GATE = "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E" as const;
const SAMPLES = [
  ["A_centered", "sample_A_centered_subject.png"],
  ["B_left_weighted", "sample_B_left_weighted.png"],
  ["C_right_weighted", "sample_C_right_weighted.png"],
  ["D_wide_negative_space", "sample_D_wide_negative_space.png"],
  ["E_edge_near", "sample_E_edge_near_subject.png"],
  ["F_complex", "sample_F_complex_scene.png"],
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blocked(message: string): never {
  throw Object.assign(new Error(message), { code: "PI_2C_LIVE_REVIEW_BLOCKED" });
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/gu, "[REDACTED]")
    .replace(/Bearer\s+[^\s]+/giu, "Bearer [REDACTED]")
    .replace(/OPENAI_API_KEY[=:][^\s]+/giu, "OPENAI_API_KEY=[REDACTED]");
}

function assertLiveEnvironment(): void {
  if (process.env.OPENAI_PROVIDER_MODE !== "live") blocked("OPENAI_PROVIDER_MODE_LIVE_REQUIRED");
  if (!process.env.OPENAI_API_KEY?.trim()) blocked("OPENAI_API_KEY_REQUIRED");
  if (process.env.OPENAI_MODEL?.trim() !== "gpt-5.6-luna")
    blocked("OPENAI_MODEL_MUST_BE_GPT_5_6_LUNA");
  const required = [
    "OPENAI_PRICING_VERSION",
    "OPENAI_INPUT_COST_MICRO_USD_PER_MILLION",
    "OPENAI_OUTPUT_COST_MICRO_USD_PER_MILLION",
    "OPENAI_CACHED_INPUT_COST_MICRO_USD_PER_MILLION",
    "OPENAI_LIVE_MAX_ESTIMATED_INPUT_TOKENS",
    "OPENAI_LIVE_PER_RUN_SOFT_STOP_MICRO_USD",
    "OPENAI_LIVE_PER_RUN_HARD_CAP_MICRO_USD",
    "OPENAI_LIVE_MONTHLY_LIMIT_MICRO_USD",
    "OPENAI_LIVE_SAFETY_BUFFER_MICRO_USD",
    "OPENAI_LIVE_ABSOLUTE_PROVIDER_CALL_CAP",
    "OPENAI_LIVE_BILLING_SCOPE",
  ] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) blocked(`LIVE_REVIEW_MISSING_ENV:${missing.join(",")}`);
  try {
    createLiveSmokePricingPolicy(process.env);
  } catch (error) {
    blocked(`LIVE_REVIEW_POLICY_INVALID:${safeErrorMessage(error)}`);
  }
}

async function prepareSamples(): Promise<{ readonly root: string; readonly zipSha256: string }> {
  const zipBytes = await readFile(SAMPLE_ZIP);
  const zipSha256 = sha256(zipBytes);
  if (zipSha256 !== EXPECTED_ZIP_SHA256) blocked(`SAMPLE_ZIP_HASH_MISMATCH:${zipSha256}`);
  const root = await mkdtemp(path.join(os.tmpdir(), "plume-pi-2c-samples-"));
  await execFile("tar", ["-xf", SAMPLE_ZIP, "-C", root]);
  return { root, zipSha256 };
}

function sampleFile(root: string, filename: string): string {
  return path.join(root, filename);
}

function assertReviewJsonSafe(bytes: Uint8Array, relativePath: string): void {
  const text = new TextDecoder().decode(bytes);
  if (
    /OPENAI_API_KEY|Bearer\s|data:image\/|Authorization/iu.test(text) ||
    /^[A-Za-z0-9+/]{256,}={0,2}$/mu.test(text)
  )
    blocked(`REVIEW_PACK_SECRET_SCAN_FAILED:${relativePath}`);
}

function createClientBrandRepositories(fixture: ReturnType<typeof createJacomoFixture>) {
  return createInMemoryClientBrandRepositories({
    advertisers: [
      {
        id: fixture.advertiser.id,
        workspaceId: fixture.workspace.id,
        name: fixture.advertiser.name,
        normalizedName: fixture.advertiser.name,
        status: "ACTIVE",
        ownerUserId: fixture.owner.id,
        revisionNo: 1,
      },
    ],
    brands: [
      {
        id: fixture.brand.id,
        workspaceId: fixture.workspace.id,
        advertiserId: fixture.advertiser.id,
        name: fixture.brand.name,
        normalizedName: fixture.brand.name,
        status: "ACTIVE",
        revisionNo: 1,
      },
    ],
  });
}

function createLiveCountingGateway(counter: ProviderCallCounter): AgentProviderGateway {
  const runtime = createOpenAIProviderRuntime({ environment: process.env });
  return {
    async execute(request) {
      counter.calls += 1;
      const result = await runtime.gateway.execute({
        ...request,
        metadata: {
          ...request.metadata,
          environment: "local",
          gate: GATE,
          customerData: "synthetic",
        },
      });
      counter.models.push(result.model ?? "UNKNOWN");
      counter.statuses.push(result.status);
      counter.evidence.push({
        status: result.status,
        model: result.model,
        providerRequestIdHash: result.providerRequestIdHash,
        evidence: result.evidence,
      });
      return result;
    },
  };
}

async function writeSampleArtifacts(
  outputRoot: string,
  sampleKey: string,
  inputBytes: Uint8Array,
  result: ThumbnailSemanticWorkflowResult,
  providerCalls: ProviderCallCounter,
  providerStartIndex: number,
): Promise<Readonly<Record<string, unknown>>> {
  const directory = path.join(outputRoot, sampleKey);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "input.png"), inputBytes);
  await writeFile(path.join(directory, "render.png"), result.renderBytes);
  await writeFile(
    path.join(directory, "semantic-agent.json"),
    JSON.stringify(result.semanticPlacement.agentOutput, null, 2),
  );
  await writeFile(
    path.join(directory, "crop-candidate.json"),
    JSON.stringify(result.semanticPlacement.candidate, null, 2),
  );
  await writeFile(
    path.join(directory, "accepted-plan.json"),
    JSON.stringify(result.semanticPlacement.acceptedPlan, null, 2),
  );
  await writeFile(
    path.join(directory, "product-flow.json"),
    JSON.stringify(result.productFlow, null, 2),
  );
  await writeFile(
    path.join(directory, "renderer-output.json"),
    JSON.stringify(result.renderResult, null, 2),
  );
  await writeFile(
    path.join(directory, "validation.json"),
    JSON.stringify(result.validationResult, null, 2),
  );
  await writeFile(path.join(directory, "export.zip"), result.exportBytes);
  await writeFile(
    path.join(directory, "provider-evidence.json"),
    JSON.stringify(
      {
        callCount: result.agentGenerateCalls,
        renderCalls: result.agentRenderCalls,
        models: providerCalls.models.slice(providerStartIndex),
        statuses: providerCalls.statuses.slice(providerStartIndex),
        evidence: providerCalls.evidence.slice(providerStartIndex),
      },
      null,
      2,
    ),
  );
  return {
    inputSha256: sha256(inputBytes),
    renderSha256: result.renderChecksumSha256,
    exportSha256: result.exportChecksumSha256,
    exportEmbeddedPngSha256: result.exportEmbeddedPngChecksumSha256,
    productId: result.productId,
    campaignId: result.campaignId,
    generationJobId: result.generationJobId,
    creativeVersionId: result.creativeVersionId,
    agentGenerateCalls: result.agentGenerateCalls,
    agentRenderCalls: result.agentRenderCalls,
    commands: result.commands,
    providerModels: providerCalls.models.slice(providerStartIndex),
    providerStatuses: providerCalls.statuses.slice(providerStartIndex),
  };
}

async function main(): Promise<void> {
  assertLiveEnvironment();
  const { root: sampleRoot, zipSha256 } = await prepareSamples();
  const fixture = createJacomoFixture();
  const providerCalls: ProviderCallCounter = { calls: 0, models: [], statuses: [], evidence: [] };
  const harness = await startProcessHarness({
    workerProviderGateway: createLiveCountingGateway(providerCalls),
    workerProviderMode: "live",
    clientBrandRepositories: createClientBrandRepositories(fixture),
  });
  try {
    await seedJacomoFixture(harness.database, fixture);
    await rm(REVIEW_ROOT, { recursive: true, force: true });
    await mkdir(REVIEW_ROOT, { recursive: true });
    const summaries: Record<string, unknown> = {};
    for (const [sampleKey, filename] of SAMPLES) {
      const inputBytes = new Uint8Array(await readFile(sampleFile(sampleRoot, filename)));
      const imageMetadata = await inspectImageBytes(inputBytes);
      if (
        imageMetadata.detectedMimeType !== "image/png" &&
        imageMetadata.detectedMimeType !== "image/jpeg"
      )
        blocked(`${sampleKey}:UNSUPPORTED_SAMPLE_MIME`);
      const providerStartIndex = providerCalls.calls;
      const result = await runThumbnailSemanticProductWorkflow({
        harness,
        fixture,
        bytes: inputBytes,
        mimeType: imageMetadata.detectedMimeType,
        formatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
        label: sampleKey,
        productName: `PI-2C real sample ${sampleKey}`,
        providerCalls,
      });
      summaries[sampleKey] = await writeSampleArtifacts(
        REVIEW_ROOT,
        sampleKey,
        inputBytes,
        result,
        providerCalls,
        providerStartIndex,
      );
    }
    if (providerCalls.calls !== SAMPLES.length)
      blocked(`LIVE_GENERATE_CALL_COUNT:${providerCalls.calls}`);
    const summary = {
      gate: GATE,
      status: "IMPLEMENTED_PENDING_USER_VISUAL_ACCEPTANCE",
      processHarness: true,
      providerMode: process.env.OPENAI_PROVIDER_MODE,
      provider: "OpenAI",
      model: process.env.OPENAI_MODEL,
      providerCallCount: providerCalls.calls,
      providerStatuses: providerCalls.statuses,
      samplePackSha256: zipSha256,
      samples: summaries,
      userVisualAcceptance: "PENDING",
    };
    await writeFile(path.join(REVIEW_ROOT, "summary.json"), JSON.stringify(summary, null, 2));
    await writeFile(
      path.join(REVIEW_ROOT, "README.md"),
      "# PI-2C Thumbnail Semantic Review Pack\n\nTechnical candidate output from the actual Product Workflow process harness. User visual acceptance remains PENDING. Review PRODUCT identity, clipping, crop composition, complex-scene interpretation, slot composition, text/template rendering, orientation, corruption, and blank output for all six samples.\n",
    );
    const files: { relativePath: string; bytesValue: Uint8Array }[] = [];
    async function collect(directory: string, prefix = ""): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await collect(absolute, relative);
        else {
          const bytes = new Uint8Array(await readFile(absolute));
          assertReviewJsonSafe(bytes, relative);
          files.push({ relativePath: relative.replaceAll("\\", "/"), bytesValue: bytes });
        }
      }
    }
    await collect(REVIEW_ROOT);
    const checksums = Object.fromEntries(
      files
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
        .map((file) => [file.relativePath, sha256(file.bytesValue)]),
    );
    await writeFile(path.join(REVIEW_ROOT, "checksums.json"), JSON.stringify(checksums, null, 2));
    const finalFiles = [
      ...files,
      {
        relativePath: "checksums.json",
        bytesValue: new Uint8Array(await readFile(path.join(REVIEW_ROOT, "checksums.json"))),
      },
    ];
    const pack = buildExportPackage({
      exportJobId: "PI-2C-Thumbnail-Semantic-Review-Pack",
      recipe: { id: "pi-2c-review-pack", includeManifest: false, includeValidationReport: false },
      items: finalFiles.map((file) => ({
        creativeVersionId: "review-pack",
        relativePath: file.relativePath,
        bytes: file.bytesValue,
      })),
    });
    const packPath = path.join(REVIEW_ROOT, REVIEW_PACK_NAME);
    await writeFile(packPath, pack.zipBytes);
    await writeFile(
      path.join(REVIEW_ROOT, "review-pack.sha256"),
      `${sha256(pack.zipBytes)}  ${REVIEW_PACK_NAME}\n`,
    );
    console.log(
      JSON.stringify(
        {
          status: "PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E_CANDIDATE_PASS",
          pending: "PENDING_USER_VISUAL_ACCEPTANCE",
          processHarness: true,
          reviewPackPath: packPath,
          reviewPackSha256: sha256(pack.zipBytes),
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
    await rm(sampleRoot, { recursive: true, force: true });
  }
}

if (process.env.VITEST) {
  describe("PI-2C live semantic placement Review Pack", () => {
    it("runs only with the approved live provider through the actual Product Workflow", async () => {
      await main();
    }, 600_000);
  });
} else {
  main().catch((error) => {
    console.error("PI_2C_REAL_IMAGE_SEMANTIC_PLACEMENT_E2E_BLOCKED");
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}
