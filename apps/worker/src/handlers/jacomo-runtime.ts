import type { Job } from "bullmq";
import { createHash } from "node:crypto";
import { buildExportPackage } from "../../../../packages/infrastructure/src/export/build-package.js";
import { renderCreativeDocument } from "../../../../packages/infrastructure/src/render/renderer-adapter.js";
import { runDeterministicValidation } from "../../../../packages/core/src/modules/validation/deterministic-validator.js";
import { createAgentOrchestrator } from "../../../../packages/core/src/public.js";
import { composeJacomoCreative } from "../../../../packages/core/src/modules/campaign/jacomo-workflow.js";
import {
  composeCanonicalProductCreative,
  renderCanonicalProductDocument,
  pngIsRgba,
  type CanonicalProductDependencies,
} from "./canonical-product.js";
import type { CampaignRepositories } from "../../../../packages/core/src/modules/campaign/repositories.js";
import type { AssetRepositories } from "../../../../packages/core/src/modules/asset/repositories.js";
import type { CreativeRepositories } from "../../../../packages/core/src/modules/creative/repositories.js";
import type { FileObjectRecord } from "../../../../packages/core/src/modules/asset/upload-session.js";
import {
  validateCommandEnvelope,
  type CreativeGeneratePayload,
  type CreativeRenderPayload,
  type ExportPackagePayload,
  type ValidationRunPayload,
} from "../../../../packages/contracts/src/async.js";
import type { AsyncCommandPublisher } from "../../../../packages/core/src/async/command-publisher.js";
import type { ObjectStorage } from "../../../../packages/infrastructure/src/storage/s3-object-storage.js";
import { createIdempotencyGuard } from "../middleware/idempotency.js";
import { PermanentJobError, type RuntimeJobHandler } from "../runtime-registry.js";
import { DrizzleInboxRepository } from "../../../../packages/infrastructure/src/db/inbox-drizzle-repository.js";
import {
  DurableWorkflowRepository,
  type WorkflowItem,
} from "../../../../packages/infrastructure/src/async/durable-workflow-repository.js";
import type { Sql } from "postgres";
import type { AgentProviderGateway } from "../../../../packages/core/src/agents/orchestrator.js";
import type { ClientBrandRepositories } from "../../../../packages/core/src/modules/client-brand/repositories.js";
import {
  createLiveSmokeHandler,
  createLiveSmokeProviderCanaryHandler,
  createLiveSmokeVerificationHandler,
} from "./ai/live-smoke.js";
import type { LiveSmokeBudgetStore } from "../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeProviderMode } from "../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import type { LiveSmokeLifecycleStore } from "../../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";
import type { LiveSmokeValidationEvidenceStore } from "../../../../packages/infrastructure/src/async/live-smoke-validation-evidence-store.js";
import type { LiveSmokeFailureEvidenceStore } from "../../../../packages/infrastructure/src/async/live-smoke-failure-evidence-store.js";
import type { LiveSmokePricingPolicy } from "../../../../packages/infrastructure/src/async/live-smoke-spend-policy.js";
import { DurableProjectGenerationPersistence } from "../../../../packages/infrastructure/src/db/durable-project-generation-persistence.js";

interface RuntimeDependencies {
  readonly sql: Sql;
  readonly publisher: AsyncCommandPublisher;
  readonly storage: ObjectStorage;
  readonly workflow: DurableWorkflowRepository;
  readonly queuePrefix?: string;
  readonly providerGateway: AgentProviderGateway;
  readonly liveSmokeBudgetStore: LiveSmokeBudgetStore;
  readonly liveSmokeCoverageStore: LiveSmokeCoverageStore;
  readonly liveSmokeLifecycleStore: LiveSmokeLifecycleStore;
  readonly liveSmokeValidationEvidenceStore: LiveSmokeValidationEvidenceStore;
  readonly liveSmokeFailureEvidenceStore: LiveSmokeFailureEvidenceStore;
  readonly providerMode: LiveSmokeProviderMode;
  readonly pricingPolicy?: LiveSmokePricingPolicy;
  readonly campaignRepositories: CampaignRepositories;
  readonly assetRepositories: AssetRepositories;
  readonly creativeRepositories: CreativeRepositories;
  readonly clientBrandRepositories?: ClientBrandRepositories;
  readonly fileObjectReader: {
    getFileObject(workspaceId: string, fileObjectId: string): Promise<FileObjectRecord | null>;
  };
}

export function assertJobWorkspaceScope(envelope: {
  readonly workspaceId: string;
  readonly payload: unknown;
}): void {
  if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload))
    return;
  const payloadWorkspaceId = (envelope.payload as { readonly workspaceId?: unknown }).workspaceId;
  if (payloadWorkspaceId !== undefined && payloadWorkspaceId !== envelope.workspaceId)
    throw new PermanentJobError("COMMAND_PAYLOAD_WORKSPACE_MISMATCH");
}

function jobEnvelope(job: Job<unknown>, command: string) {
  if (job.name !== command) throw new PermanentJobError(`COMMAND_JOB_NAME_MISMATCH:${command}`);
  try {
    const envelope = validateCommandEnvelope(job.data);
    if (envelope.command !== command)
      throw new PermanentJobError(`COMMAND_ENVELOPE_MISMATCH:${command}`);
    assertJobWorkspaceScope(envelope);
    return envelope;
  } catch (error) {
    if (error instanceof PermanentJobError) throw error;
    throw new PermanentJobError(error instanceof Error ? error.message : "ASYNC_ENVELOPE_INVALID");
  }
}

function errorSummary(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    const value = error as Error & { code?: string; retryable?: boolean };
    return {
      code: value.code ?? "WORKER_FAILED",
      message: value.message.slice(0, 500),
      retryable: value.retryable === true,
    };
  }
  return { code: "WORKER_FAILED", message: String(error).slice(0, 500), retryable: false };
}

function renderOutputProfile(payload: CreativeRenderPayload) {
  return {
    mimeType: payload.outputProfile.mimeType,
    width: payload.outputProfile.width,
    height: payload.outputProfile.height,
    ...(payload.outputProfile.maxBytes === undefined
      ? {}
      : { maxBytes: payload.outputProfile.maxBytes }),
    ...(payload.outputProfile.transparentBackground === undefined
      ? {}
      : { transparentBackground: payload.outputProfile.transparentBackground }),
  } as const;
}

function isCompleted(item: WorkflowItem): boolean {
  return item.status === "COMPLETED";
}

export function createJacomoRuntimeHandlers(
  dependencies: RuntimeDependencies,
): Readonly<Record<string, RuntimeJobHandler>> {
  const inbox = new DrizzleInboxRepository(dependencies.sql);
  const guard = createIdempotencyGuard;
  const canonicalDependencies = {
    campaignRepositories: dependencies.campaignRepositories,
    assetRepositories: dependencies.assetRepositories,
    creativeRepositories: dependencies.creativeRepositories,
    fileObjectReader: dependencies.fileObjectReader,
    storage: dependencies.storage,
    providerGateway: dependencies.providerGateway,
    agentOrchestrator: createAgentOrchestrator({ gateway: dependencies.providerGateway }),
    ...(dependencies.clientBrandRepositories
      ? { clientBrandRepositories: dependencies.clientBrandRepositories }
      : {}),
  } satisfies CanonicalProductDependencies;

  const withCommonContract =
    (
      command: string,
      run: (envelope: ReturnType<typeof jobEnvelope>, job: Job<unknown>) => Promise<unknown>,
    ): RuntimeJobHandler =>
    async (job) => {
      const envelope = jobEnvelope(job, command);
      const guarded = guard(inbox, {
        handlerName: command,
        handlerVersion: "v1",
        ...(dependencies.queuePrefix ? { queuePrefix: dependencies.queuePrefix } : {}),
      });
      try {
        return await guarded(envelope, async () => {
          const item = await dependencies.workflow.claimItem(
            envelope.workspaceId,
            envelope.jobId,
            envelope.jobItemId!,
          );
          if (isCompleted(item)) return item.result;
          try {
            const outcome = await run(envelope, job);
            await dependencies.workflow.completeItem(
              envelope.workspaceId,
              envelope.jobId,
              envelope.jobItemId!,
              outcome,
            );
            await afterComplete(command, envelope, outcome);
            return outcome;
          } catch (error) {
            const summary = errorSummary(error);
            if (summary.retryable === true)
              await dependencies.workflow.releaseItem(
                envelope.workspaceId,
                envelope.jobId,
                envelope.jobItemId!,
              );
            else
              await dependencies.workflow.failItem(
                envelope.workspaceId,
                envelope.jobId,
                envelope.jobItemId!,
                summary,
              );
            throw error;
          }
        });
      } catch (error) {
        throw error;
      }
    };

  const handlers: Record<string, RuntimeJobHandler> = {};
  const liveSmoke = createLiveSmokeHandler(
    dependencies.providerGateway,
    dependencies.liveSmokeBudgetStore,
    {
      providerMode: dependencies.providerMode,
      ...(dependencies.pricingPolicy ? { pricingPolicy: dependencies.pricingPolicy } : {}),
      lifecycleStore: dependencies.liveSmokeLifecycleStore,
      validationEvidenceStore: dependencies.liveSmokeValidationEvidenceStore,
      failureEvidenceStore: dependencies.liveSmokeFailureEvidenceStore,
    },
  );
  const liveSmokeVerification = createLiveSmokeVerificationHandler(
    dependencies.providerGateway,
    dependencies.liveSmokeBudgetStore,
    dependencies.liveSmokeCoverageStore,
    {
      providerMode: dependencies.providerMode,
      ...(dependencies.pricingPolicy ? { pricingPolicy: dependencies.pricingPolicy } : {}),
      lifecycleStore: dependencies.liveSmokeLifecycleStore,
      validationEvidenceStore: dependencies.liveSmokeValidationEvidenceStore,
      failureEvidenceStore: dependencies.liveSmokeFailureEvidenceStore,
    },
  );
  const liveSmokeCanary = createLiveSmokeProviderCanaryHandler(
    dependencies.providerGateway,
    dependencies.liveSmokeBudgetStore,
    dependencies.liveSmokeLifecycleStore,
    {
      providerMode: dependencies.providerMode,
      ...(dependencies.pricingPolicy ? { pricingPolicy: dependencies.pricingPolicy } : {}),
      failureEvidenceStore: dependencies.liveSmokeFailureEvidenceStore,
    },
  );
  handlers["ai.live_smoke"] = withCommonContract("ai.live_smoke", async (envelope, job) =>
    liveSmoke({ ...job, data: envelope.payload } as Job<unknown>, {
      workspaceId: envelope.workspaceId,
      smokeRunId:
        (envelope.payload as { readonly smokeRunId?: string }).smokeRunId ?? envelope.jobId,
      budgetEpochId: (envelope.payload as { readonly budgetEpochId: string }).budgetEpochId,
      jobItemId: envelope.jobItemId!,
    }),
  );
  handlers["ai.live_smoke.verify"] = withCommonContract(
    "ai.live_smoke.verify",
    async (envelope, job) =>
      liveSmokeVerification({ ...job, data: envelope.payload } as Job<unknown>, {
        workspaceId: envelope.workspaceId,
        smokeRunId: (envelope.payload as { readonly smokeRunId: string }).smokeRunId,
        budgetEpochId: (envelope.payload as { readonly budgetEpochId: string }).budgetEpochId,
        jobItemId: envelope.jobItemId!,
      }),
  );
  handlers["ai.live_smoke.canary"] = withCommonContract(
    "ai.live_smoke.canary",
    async (envelope, job) =>
      liveSmokeCanary({ ...job, data: envelope.payload } as Job<unknown>, {
        workspaceId: envelope.workspaceId,
        smokeRunId: (envelope.payload as { readonly smokeRunId: string }).smokeRunId,
        budgetEpochId: (envelope.payload as { readonly budgetEpochId: string }).budgetEpochId,
        jobItemId: envelope.jobItemId!,
      }),
  );
  handlers["creative.generate"] = withCommonContract("creative.generate", async (envelope) => {
    const payload = envelope.payload as CreativeGeneratePayload;
    await new DurableProjectGenerationPersistence(dependencies.sql).persist({
      workspaceId: envelope.workspaceId,
      jobId: envelope.jobId,
      payload,
    });
    const formatProfileId = payload.formatProfileIds[0]!;
    const canonical = payload.generationMode === "CANONICAL_RENDERER";
    if (canonical && !payload.briefVersionId)
      throw Object.assign(new Error("Canonical mode requires an exact briefVersionId"), {
        code: "CANONICAL_BRIEF_REQUIRED",
        statusCode: 422,
      });
    const creatives = canonical
      ? await Promise.all(
          payload.productIds.map((productId, index) =>
            composeCanonicalProductCreative(canonicalDependencies, {
              workspaceId: envelope.workspaceId,
              campaignId: payload.campaignId,
              productId,
              briefVersionId: payload.briefVersionId!,
              formatProfileId,
              sequence: index + 1,
              jobId: envelope.jobId,
            }).then(({ creative }) => creative),
          ),
        )
      : payload.productIds.map((productId, index) =>
          composeJacomoCreative({
            workspaceId: envelope.workspaceId,
            campaignId: payload.campaignId,
            productId,
            formatProfileId,
            sequence: index + 1,
          }),
        );
    for (const creative of creatives) {
      await dependencies.publisher.enqueue({
        workspaceId: envelope.workspaceId,
        command: "creative.render",
        schemaVersion: 1,
        jobId: envelope.jobId,
        correlationId: envelope.correlationId,
        causationId: envelope.messageId,
        payload: {
          creativeVersionId: creative.creativeVersionId,
          campaignId: payload.campaignId,
          productId: creative.document.metadata.productId ?? undefined,
          creativeDocument: creative.document,
          purpose: "FINAL_EXPORT",
          outputProfile:
            creative.document.formatProfileId === "kakao-moment-display-native-2-1-1200x600"
              ? { ...creative.outputProfile, maxBytes: 500000 }
              : creative.outputProfile,
        },
      });
    }
    await dependencies.workflow.setRootPayload(envelope.workspaceId, envelope.jobId, {
      command: envelope.command,
      schemaVersion: envelope.schemaVersion,
      campaignId: payload.campaignId,
      ...(payload.briefVersionId ? { briefVersionId: payload.briefVersionId } : {}),
      generationMode: payload.generationMode ?? "MOCK_AI",
      expectedCreatives: creatives.length,
    });
    return {
      status: "COMPLETED",
      creativeVersionIds: creatives.map((creative) => creative.creativeVersionId),
    };
  });

  handlers["creative.render"] = withCommonContract("creative.render", async (envelope) => {
    const payload = envelope.payload as CreativeRenderPayload;
    const document = payload.creativeDocument as Readonly<Record<string, unknown>>;
    const persistedVersion = await canonicalDependencies.creativeRepositories.getVersion(
      envelope.workspaceId,
      payload.creativeVersionId,
    );
    const persistedDocument = persistedVersion?.documentJson as
      | Readonly<Record<string, unknown>>
      | undefined;
    const persistedMetadata = persistedDocument?.metadata;
    const payloadMetadata = document.metadata;
    const isCanonical =
      (typeof persistedMetadata === "object" &&
        persistedMetadata !== null &&
        !Array.isArray(persistedMetadata) &&
        (persistedMetadata as { readonly renderMode?: unknown }).renderMode ===
          "CANONICAL_RENDERER") ||
      (typeof payloadMetadata === "object" &&
        payloadMetadata !== null &&
        !Array.isArray(payloadMetadata) &&
        (payloadMetadata as { readonly renderMode?: unknown }).renderMode === "CANONICAL_RENDERER");
    const canonicalResult = isCanonical
      ? await renderCanonicalProductDocument(
          canonicalDependencies,
          envelope.workspaceId,
          document,
          envelope.messageId,
          payload.creativeVersionId,
        )
      : null;
    const rendered = canonicalResult
      ? canonicalResult.result
      : renderCreativeDocument({
          requestId: envelope.messageId,
          workspaceId: envelope.workspaceId,
          creativeVersionId: payload.creativeVersionId,
          purpose: payload.purpose,
          creativeDocument: payload.creativeDocument as never,
          outputProfile: renderOutputProfile(payload),
        });
    if (rendered.status !== "COMPLETED" || !rendered.outputBytes || !rendered.checksumSha256) {
      throw new Error(String(rendered.error?.code ?? "RENDER_FAILED"));
    }
    const rendererMetadata = (rendered.renderMetadata ?? {}) as {
      readonly rendererRepository?: string;
      readonly rendererCommit?: string;
      readonly rendererIntegrationContract?: string;
      readonly rendererRuntimeVersion?: string;
      readonly legacyFallbackUsed?: boolean;
      readonly requestFingerprint?: string;
      readonly pixelFingerprint?: string;
      readonly renderFingerprint?: string;
      readonly rendererWarnings?: readonly unknown[];
      readonly rendererIntegrationOutput?: {
        readonly validation?: {
          readonly errors?: readonly unknown[];
          readonly warnings?: readonly unknown[];
          readonly info?: readonly unknown[];
        };
        readonly appliedImagePlacements?: readonly unknown[];
        readonly requestFingerprint?: string;
        readonly pixelFingerprint?: string;
        readonly renderFingerprint?: string;
      };
    };
    const rendererOutput = rendererMetadata.rendererIntegrationOutput;
    const requestFingerprint =
      rendererOutput?.requestFingerprint ?? rendererMetadata.requestFingerprint;
    const pixelFingerprint = rendererOutput?.pixelFingerprint ?? rendererMetadata.pixelFingerprint;
    const renderFingerprint =
      rendererOutput?.renderFingerprint ?? rendererMetadata.renderFingerprint;
    const objectKey = `renders/${envelope.workspaceId}/${payload.creativeVersionId}/${rendered.checksumSha256}.png`;
    const stored = await dependencies.storage.put({
      body: rendered.outputBytes,
      contentType: "image/png",
      objectKey,
      metadata: {
        workspaceId: envelope.workspaceId,
        creativeVersionId: payload.creativeVersionId,
        checksumSha256: rendered.checksumSha256,
        renderMode: isCanonical ? "CANONICAL_RENDERER" : "MOCK_AI",
        ...(rendererMetadata.rendererCommit
          ? { rendererCommit: rendererMetadata.rendererCommit }
          : {}),
        ...(rendererMetadata.rendererIntegrationContract
          ? { integrationContract: rendererMetadata.rendererIntegrationContract }
          : {}),
        ...(requestFingerprint ? { requestFingerprint } : {}),
        ...(pixelFingerprint ? { pixelFingerprint } : {}),
        ...(renderFingerprint ? { renderFingerprint } : {}),
      },
    });
    if (stored.checksumSha256 !== rendered.checksumSha256)
      throw Object.assign(new Error("Renderer artifact checksum differs from stored object"), {
        code: "STORAGE_CHECKSUM_MISMATCH",
        statusCode: 500,
      });
    return {
      status: "COMPLETED",
      creativeVersionId: payload.creativeVersionId,
      objectKey: stored.objectKey,
      checksumSha256: stored.checksumSha256,
      bytes: stored.bytes,
      purpose: payload.purpose,
      renderMode: isCanonical ? "CANONICAL_RENDERER" : "MOCK_AI",
      legacyFallbackUsed: rendererMetadata.legacyFallbackUsed ?? !isCanonical,
      ...(canonicalResult ? { canonicalDocument: canonicalResult.document } : {}),
      renderer: {
        repository: rendererMetadata.rendererRepository,
        commit: rendererMetadata.rendererCommit,
        integrationContract: rendererMetadata.rendererIntegrationContract,
        runtimeVersion: rendererMetadata.rendererRuntimeVersion,
        validation: rendererOutput?.validation ?? {
          errors: [],
          warnings: rendererMetadata.rendererWarnings ?? [],
          info: [],
        },
        appliedImagePlacements: rendererOutput?.appliedImagePlacements ?? [],
        requestFingerprint,
        pixelFingerprint,
        renderFingerprint,
        ...(canonicalResult
          ? {
              canonicalRequest: canonicalResult.request,
              assetVersionId: canonicalResult.asset.assetVersionId,
              fileObjectId: canonicalResult.asset.fileObjectId,
            }
          : {}),
      },
      width: rendered.width,
      height: rendered.height,
      mimeType: "image/png",
      rgba: pngIsRgba(rendered.outputBytes),
    };
  });

  handlers["validation.run"] = withCommonContract("validation.run", async (envelope) => {
    const payload = envelope.payload as ValidationRunPayload & {
      readonly renderObjectKey?: string;
      readonly renderChecksumSha256?: string;
      readonly renderer?: {
        readonly validation?: {
          readonly errors?: readonly unknown[];
          readonly warnings?: readonly unknown[];
          readonly info?: readonly unknown[];
        };
        readonly appliedImagePlacements?: readonly unknown[];
        readonly requestFingerprint?: string;
        readonly pixelFingerprint?: string;
        readonly renderFingerprint?: string;
        readonly canonicalRequest?: Readonly<Record<string, unknown>>;
        readonly commit?: string;
        readonly integrationContract?: string;
      };
    };
    const result = runDeterministicValidation({
      creativeDocument: payload.creativeDocument as never,
      rules: [],
    });
    const errorCount = result.findings.filter((finding) => finding.severity === "ERROR").length;
    const warningCount = result.findings.filter((finding) => finding.severity === "WARNING").length;
    const rendererErrors = payload.renderer?.validation?.errors ?? [];
    const rendererWarnings = payload.renderer?.validation?.warnings ?? [];
    const combinedErrorCount = errorCount + rendererErrors.length;
    const combinedWarningCount = warningCount + rendererWarnings.length;
    return {
      status: combinedErrorCount > 0 ? "ERROR" : combinedWarningCount > 0 ? "WARNING" : "PASS",
      creativeVersionId: payload.creativeVersionId,
      renderObjectKey: payload.renderObjectKey,
      renderChecksumSha256: payload.renderChecksumSha256,
      validationReport: {
        status: combinedErrorCount > 0 ? "ERROR" : combinedWarningCount > 0 ? "WARNING" : "PASS",
        errorCount: combinedErrorCount,
        warningCount: combinedWarningCount,
        findings: result.findings,
        rendererValidation: payload.renderer?.validation ?? { errors: [], warnings: [], info: [] },
        renderer: payload.renderer ?? null,
      },
    };
  });

  handlers["export.render_and_package"] = withCommonContract(
    "export.render_and_package",
    async (envelope) => {
      const payload = envelope.payload as ExportPackagePayload;
      const items = await Promise.all(
        payload.renderObjectKeys.map(async (objectKey, index) => ({
          creativeVersionId: payload.creativeVersionIds[index] ?? `creative-${index + 1}`,
          bytes: await dependencies.storage.get(objectKey),
          relativePath: `${payload.packageName}-${String(index + 1).padStart(2, "0")}.png`,
          mimeType: "image/png",
        })),
      );
      const embeddedPngChecksums = items.map((item) =>
        createHash("sha256").update(item.bytes).digest("hex"),
      );
      if (
        payload.renderChecksumsSha256 &&
        payload.renderChecksumsSha256.some(
          (expected, index) =>
            expected.toLowerCase() !== embeddedPngChecksums[index]?.toLowerCase(),
        )
      )
        throw Object.assign(new Error("Render checksum differs from export input"), {
          code: "EXPORT_RENDER_CHECKSUM_MISMATCH",
          statusCode: 422,
        });
      const built = buildExportPackage({
        exportJobId: payload.exportJobId,
        workspaceId: envelope.workspaceId,
        recipe: {
          id: "jacomo-staging",
          packageType: "ZIP",
          includeManifest: true,
          includeValidationReport: true,
        },
        items,
      });
      const objectKey = `exports/${envelope.workspaceId}/${payload.exportJobId}/${built.checksumSha256}.zip`;
      const stored = await dependencies.storage.put({
        body: built.zipBytes,
        contentType: "application/zip",
        objectKey,
        metadata: {
          workspaceId: envelope.workspaceId,
          jobId: envelope.jobId,
          checksumSha256: built.checksumSha256,
        },
      });
      return {
        status: "COMPLETED",
        exportJobId: payload.exportJobId,
        objectKey: stored.objectKey,
        checksumSha256: stored.checksumSha256,
        bytes: stored.bytes,
        manifest: built.manifest,
        validationReportCount: 1,
        embeddedPngChecksums,
      };
    },
  );

  async function afterComplete(
    command: string,
    envelope: ReturnType<typeof jobEnvelope>,
    outcome: unknown,
  ): Promise<void> {
    if (
      command === "ai.live_smoke" ||
      command === "ai.live_smoke.verify" ||
      command === "ai.live_smoke.canary"
    ) {
      await dependencies.workflow.completeRootIfReady(envelope.workspaceId, envelope.jobId);
      return;
    }
    if (command === "validation.run") {
      const items = await dependencies.workflow.listItems(envelope.workspaceId, envelope.jobId);
      const validationItems = items.filter((item) => item.command === "validation.run");
      if (validationItems.length === 0 || !validationItems.every(isCompleted)) return;
      if (items.some((item) => item.command === "export.render_and_package")) return;
      const blockedValidation = validationItems.some((item) => {
        const result = item.result as
          | { readonly status?: string; readonly validationReport?: { readonly status?: string } }
          | undefined;
        return result?.status === "ERROR" || result?.validationReport?.status === "ERROR";
      });
      if (blockedValidation) throw new Error("VALIDATION_BLOCKED_EXPORT");
      const renderItems = items.filter(
        (item) => item.command === "creative.render" && isCompleted(item),
      );
      const renderOutputs = renderItems.map(
        (item) =>
          item.result as {
            creativeVersionId?: string;
            objectKey?: string;
            checksumSha256?: string;
          },
      );
      const renderObjectKeys = renderOutputs.flatMap((item) =>
        item.objectKey ? [item.objectKey] : [],
      );
      const creativeVersionIds = renderOutputs.flatMap((item) =>
        item.creativeVersionId ? [item.creativeVersionId] : [],
      );
      const renderChecksumsSha256 = renderOutputs.flatMap((item) =>
        item.checksumSha256 ? [item.checksumSha256] : [],
      );
      if (renderObjectKeys.length === 0 || renderObjectKeys.length !== creativeVersionIds.length)
        throw new Error("EXPORT_RENDER_REFERENCES_INCOMPLETE");
      if (renderChecksumsSha256.length !== renderObjectKeys.length)
        throw new Error("EXPORT_RENDER_CHECKSUM_REFERENCES_INCOMPLETE");
      await dependencies.publisher.enqueue({
        workspaceId: envelope.workspaceId,
        command: "export.render_and_package",
        schemaVersion: 1,
        jobId: envelope.jobId,
        correlationId: envelope.correlationId,
        causationId: envelope.messageId,
        payload: {
          exportJobId: envelope.jobId,
          creativeVersionIds,
          renderObjectKeys,
          renderChecksumsSha256,
          packageName: "JACOMO-STAGING",
        },
      });
      return;
    }
    if (command !== "creative.render") {
      if (command === "export.render_and_package")
        await dependencies.workflow.completeRootIfReady(envelope.workspaceId, envelope.jobId);
      return;
    }
    const value = outcome as {
      creativeVersionId?: string;
      objectKey?: string;
      checksumSha256?: string;
      renderer?: unknown;
      canonicalDocument?: Readonly<Record<string, unknown>>;
    };
    if (!value.objectKey || !value.creativeVersionId)
      throw new Error("RENDER_RESULT_REFERENCE_REQUIRED");
    await dependencies.publisher.enqueue({
      workspaceId: envelope.workspaceId,
      command: "validation.run",
      schemaVersion: 1,
      jobId: envelope.jobId,
      correlationId: envelope.correlationId,
      causationId: envelope.messageId,
      payload: {
        creativeVersionId: value.creativeVersionId,
        creativeDocument:
          value.canonicalDocument ?? (envelope.payload as CreativeRenderPayload).creativeDocument,
        renderObjectKey: value.objectKey,
        renderChecksumSha256: value.checksumSha256,
        ...(value.renderer ? { renderer: value.renderer } : {}),
        ruleSnapshot: { sourceVersion: "jacomo-staging", rules: [] },
      },
    });
  }

  return Object.freeze(handlers);
}
