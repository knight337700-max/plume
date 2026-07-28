import { randomUUID } from "node:crypto";
import { applyEditOperations, type EditOperationBatch } from "./apply-edit-operations.js";
import { hashCreativeDocument } from "./document-hash.js";
import type { CreativeDocument } from "./creative-document.js";
import type {
  CreativeRepositories,
  CreativeRecord,
  CreativeRenderRecord,
  CreativeSetRecord,
  CreativeVersionRecord,
} from "./repositories.js";

export interface CreativeRenderJob {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly purpose: "PREVIEW" | "VALIDATION" | "FINAL_EXPORT";
  readonly status: "QUEUED";
}
export interface CreativeRenderScheduler {
  enqueue(
    input: Omit<CreativeRenderJob, "id" | "status"> & { id?: string },
  ): Promise<CreativeRenderJob>;
}
export interface CreativeEditPreview {
  readonly creativeVersionId: string;
  readonly before: CreativeDocument;
  readonly after: CreativeDocument;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly operationCount: number;
}
export interface CreativeDuplicateResult {
  readonly creative: CreativeRecord;
  readonly version?: CreativeVersionRecord;
}
export interface CreativeUseCases {
  listSets(workspaceId: string, campaignId?: string): Promise<readonly CreativeSetRecord[]>;
  getSet(workspaceId: string, creativeSetId: string): Promise<CreativeSetRecord | null>;
  list(workspaceId: string, creativeSetId?: string): Promise<readonly CreativeRecord[]>;
  get(workspaceId: string, creativeId: string): Promise<CreativeRecord | null>;
  archive(
    workspaceId: string,
    creativeId: string,
    expectedRevision?: number,
  ): Promise<CreativeRecord>;
  duplicate(input: {
    readonly workspaceId: string;
    readonly creativeId: string;
    readonly id?: string;
    readonly targetCreativeSetId?: string | null;
  }): Promise<CreativeDuplicateResult>;
  listVersions(workspaceId: string, creativeId: string): Promise<readonly CreativeVersionRecord[]>;
  getVersion(workspaceId: string, versionId: string): Promise<CreativeVersionRecord | null>;
  createVersion(
    input: Parameters<CreativeRepositories["createVersion"]>[0],
  ): Promise<CreativeVersionRecord>;
  autosave(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly documentJson: CreativeDocument;
    readonly expectedRevision: number;
    readonly copyAssetsJson?: Readonly<Record<string, unknown>>;
    readonly generationMetadataJson?: Readonly<Record<string, unknown>>;
  }): Promise<CreativeVersionRecord>;
  previewEdit(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly batch: EditOperationBatch;
    readonly expectedRevision?: number;
  }): Promise<CreativeEditPreview>;
  applyEdit(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly batch: EditOperationBatch;
    readonly confirmed?: boolean;
    readonly expectedRevision?: number;
    readonly appliedBy?: string | null;
  }): Promise<CreativeVersionRecord>;
  requestRender(input: {
    readonly workspaceId: string;
    readonly versionId: string;
    readonly purpose: CreativeRenderJob["purpose"];
    readonly idempotencyKey?: string;
  }): Promise<CreativeRenderJob>;
  freezeVersion(workspaceId: string, versionId: string): Promise<CreativeVersionRecord>;
  listRenders(workspaceId: string, versionId: string): Promise<readonly CreativeRenderRecord[]>;
}

function notFound(kind: string): Error {
  const error = new Error(`${kind} not found`);
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}
function conflict(code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: 409 });
  return error;
}

export function createInMemoryRenderScheduler(): CreativeRenderScheduler {
  return {
    async enqueue(input) {
      return {
        id: input.id ?? randomUUID(),
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        purpose: input.purpose,
        status: "QUEUED",
      };
    },
  };
}

export function createCreativeUseCases(dependencies: {
  readonly repositories: CreativeRepositories;
  readonly renderScheduler?: CreativeRenderScheduler;
}): CreativeUseCases {
  const renderScheduler = dependencies.renderScheduler ?? createInMemoryRenderScheduler();
  const getOwnedVersion = async (
    workspaceId: string,
    versionId: string,
  ): Promise<CreativeVersionRecord> => {
    const version = await dependencies.repositories.getVersion(workspaceId, versionId);
    if (!version) throw notFound("Creative version");
    return version;
  };
  return {
    listSets: (workspaceId, campaignId) =>
      dependencies.repositories.listCreativeSets(workspaceId, campaignId),
    getSet: (workspaceId, creativeSetId) =>
      dependencies.repositories.getCreativeSet(workspaceId, creativeSetId),
    list: (workspaceId, creativeSetId) =>
      dependencies.repositories.listCreatives(workspaceId, creativeSetId),
    get: (workspaceId, creativeId) =>
      dependencies.repositories.getCreative(workspaceId, creativeId),
    archive: (workspaceId, creativeId, expectedRevision) =>
      dependencies.repositories.updateCreative(
        workspaceId,
        creativeId,
        { status: "ARCHIVED" },
        expectedRevision,
      ),
    async duplicate(input) {
      const source = await dependencies.repositories.getCreative(
        input.workspaceId,
        input.creativeId,
      );
      if (!source) throw notFound("Creative");
      const targetSet = input.targetCreativeSetId
        ? await dependencies.repositories.getCreativeSet(
            input.workspaceId,
            input.targetCreativeSetId,
          )
        : null;
      if (input.targetCreativeSetId && !targetSet) throw notFound("Creative set");
      const creative = await dependencies.repositories.createCreative({
        ...(input.id ? { id: input.id } : {}),
        workspaceId: source.workspaceId,
        creativeSetId: targetSet?.id ?? source.creativeSetId,
        campaignId: source.campaignId,
        productId: source.productId ?? null,
        campaignFormatSelectionId: source.campaignFormatSelectionId,
      });
      if (!source.currentVersionId) return { creative };
      const version = await getOwnedVersion(input.workspaceId, source.currentVersionId);
      const duplicateVersion = await dependencies.repositories.createVersion({
        workspaceId: source.workspaceId,
        creativeId: creative.id,
        formatProfileId: version.formatProfileId,
        layoutTemplateId: version.layoutTemplateId ?? null,
        briefVersionId: version.briefVersionId,
        documentJson: version.documentJson,
        copyAssetsJson: version.copyAssetsJson,
        generationMetadataJson: {
          ...version.generationMetadataJson,
          duplicatedFromCreativeId: source.id,
          duplicatedFromVersionId: version.id,
        },
      });
      return {
        creative:
          (await dependencies.repositories.getCreative(input.workspaceId, creative.id)) ?? creative,
        version: duplicateVersion,
      };
    },
    listVersions: (workspaceId, creativeId) =>
      dependencies.repositories.listVersions(workspaceId, creativeId),
    getVersion: (workspaceId, versionId) =>
      dependencies.repositories.getVersion(workspaceId, versionId),
    createVersion: (input) => dependencies.repositories.createVersion(input),
    autosave: (input) =>
      dependencies.repositories.updateDraftVersion(
        input.workspaceId,
        input.versionId,
        {
          documentJson: input.documentJson,
          ...(input.copyAssetsJson ? { copyAssetsJson: input.copyAssetsJson } : {}),
          ...(input.generationMetadataJson
            ? { generationMetadataJson: input.generationMetadataJson }
            : {}),
        },
        input.expectedRevision,
      ),
    async previewEdit(input) {
      const version = await getOwnedVersion(input.workspaceId, input.versionId);
      if (input.expectedRevision !== undefined && input.expectedRevision !== version.revisionNo)
        throw conflict("REVISION_MISMATCH", "Creative version revision has changed");
      const after = applyEditOperations(version.documentJson, input.batch);
      return {
        creativeVersionId: version.id,
        before: version.documentJson,
        after,
        beforeHash: hashCreativeDocument(version.documentJson),
        afterHash: hashCreativeDocument(after),
        operationCount: input.batch.operations.length,
      };
    },
    async applyEdit(input) {
      const version = await getOwnedVersion(input.workspaceId, input.versionId);
      if (input.expectedRevision !== undefined && input.expectedRevision !== version.revisionNo)
        throw conflict("REVISION_MISMATCH", "Creative version revision has changed");
      if (input.batch.requiresUserConfirmation && !input.confirmed)
        throw conflict(
          "USER_CONFIRMATION_REQUIRED",
          "Edit operation batch requires explicit user confirmation",
        );
      const document = applyEditOperations(version.documentJson, input.batch);
      const next = await dependencies.repositories.createVersion({
        workspaceId: input.workspaceId,
        creativeId: version.creativeId,
        parentVersionId: version.id,
        formatProfileId: version.formatProfileId,
        layoutTemplateId: version.layoutTemplateId ?? null,
        briefVersionId: version.briefVersionId,
        documentJson: document,
        copyAssetsJson: document.copyAssets,
        generationMetadataJson: {
          ...version.generationMetadataJson,
          source: "EDIT_OPERATION_BATCH",
          sourceVersionId: version.id,
        },
      });
      await dependencies.repositories.appendEditOperations(
        input.batch.operations.map((operation) => ({
          workspaceId: input.workspaceId,
          creativeVersionId: next.id,
          source: "USER",
          commandText: operation.explanation ?? null,
          operationJson: operation as unknown as Record<string, unknown>,
          appliedBy: input.appliedBy ?? null,
        })),
      );
      return next;
    },
    async requestRender(input) {
      const version = await getOwnedVersion(input.workspaceId, input.versionId);
      if (!version) throw notFound("Creative version");
      return renderScheduler.enqueue({
        ...(input.idempotencyKey ? { id: input.idempotencyKey } : {}),
        workspaceId: input.workspaceId,
        creativeVersionId: version.id,
        purpose: input.purpose,
      });
    },
    freezeVersion: (workspaceId, versionId) =>
      dependencies.repositories.freezeVersion(workspaceId, versionId),
    listRenders: (workspaceId, versionId) =>
      dependencies.repositories.listRenders(workspaceId, versionId),
  };
}
