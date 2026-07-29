import { createHash } from "node:crypto";
import { assertExportEligible, type ExportEligibilityInput } from "../../../../../packages/core/src/modules/export/eligibility.js";
import type { ExportItemRecord, ExportRepositories } from "../../../../../packages/core/src/modules/export/repositories.js";
import { buildExportPackage, type BuildExportPackageInput, type BuildExportPackageResult, type ExportPackageItemInput } from "../../../../../packages/infrastructure/src/export/build-package.js";

export interface ExportRenderedInput {
  readonly bytes: Uint8Array;
  readonly checksumSha256?: string;
}

export interface ExportWorkerItemInput extends Omit<ExportPackageItemInput, "bytes"> {
  readonly recordId: string;
  readonly eligibility: ExportEligibilityInput;
  readonly rendered?: ExportRenderedInput;
  readonly render?: () => Promise<ExportRenderedInput>;
}

export interface ExportWorkerInput {
  readonly workspaceId: string;
  readonly jobId: string;
  readonly packageInput: Omit<BuildExportPackageInput, "exportJobId" | "workspaceId" | "items">;
  readonly items: readonly ExportWorkerItemInput[];
  readonly requireCompletePackage?: boolean;
}

export interface ExportWorkerResult {
  readonly status: "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
  readonly jobId: string;
  readonly completedItemIds: readonly string[];
  readonly failedItemIds: readonly string[];
  readonly package?: BuildExportPackageResult;
}

function errorJson(error: unknown): Readonly<Record<string, unknown>> {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; reasons?: unknown };
    return { code: typeof value.code === "string" ? value.code : "EXPORT_ITEM_FAILED", message: typeof value.message === "string" ? value.message : "Export item failed", ...(value.reasons === undefined ? {} : { reasons: value.reasons }) };
  }
  return { code: "EXPORT_ITEM_FAILED", message: String(error) };
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function checkpointOf(item: ExportItemRecord): { readonly renderChecksumSha256?: string } {
  const value = item.checkpointJson?.renderChecksumSha256;
  return typeof value === "string" ? { renderChecksumSha256: value } : {};
}

export function createExportWorkerHandler(dependencies: {
  readonly repositories: ExportRepositories;
  readonly buildPackage?: (input: BuildExportPackageInput) => BuildExportPackageResult;
}) {
  const buildPackage = dependencies.buildPackage ?? buildExportPackage;
  return async function handle(input: ExportWorkerInput): Promise<ExportWorkerResult> {
    const job = await dependencies.repositories.getJob(input.workspaceId, input.jobId);
    if (!job) throw Object.assign(new Error("Export job not found"), { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
    const records = await dependencies.repositories.listItems(input.workspaceId, input.jobId);
    const recordsById = new Map(records.map((item) => [item.id, item]));
    await dependencies.repositories.updateJob(input.workspaceId, input.jobId, { status: "RUNNING", errorJson: null, completedAt: null });
    const completed: string[] = [];
    const failed: string[] = [];
    const packageItems: ExportPackageItemInput[] = [];
    for (const item of [...input.items].sort((left, right) => left.recordId.localeCompare(right.recordId))) {
      const record = recordsById.get(item.recordId);
      if (!record) {
        failed.push(item.recordId);
        continue;
      }
      try {
        assertExportEligible(item.eligibility);
        const previous = checkpointOf(record);
        let rendered = item.rendered;
        const declaredChecksum = rendered?.checksumSha256 ?? (rendered ? checksum(rendered.bytes) : undefined);
        const renderReused = rendered !== undefined && previous.renderChecksumSha256 === declaredChecksum;
        if (!rendered) {
          if (!item.render) throw new Error("Final render is required for export");
          rendered = await item.render();
        }
        const actualChecksum = rendered.checksumSha256 ?? checksum(rendered.bytes);
        await dependencies.repositories.updateItem(input.workspaceId, record.id, { status: "COMPLETED", errorJson: null, checkpointJson: { renderChecksumSha256: actualChecksum, renderReusable: true, renderReused } });
        completed.push(record.id);
        packageItems.push({ ...item, bytes: rendered.bytes });
      } catch (error) {
        failed.push(record.id);
        await dependencies.repositories.updateItem(input.workspaceId, record.id, { status: "FAILED", errorJson: errorJson(error) });
      }
    }
    if (failed.length > 0 && input.requireCompletePackage === true) {
      await dependencies.repositories.updateJob(input.workspaceId, input.jobId, { status: "FAILED", completedAt: new Date().toISOString(), errorJson: { code: "COMPLETE_PACKAGE_REQUIRED", failedItemIds: failed } });
      return { status: "FAILED", jobId: input.jobId, completedItemIds: completed, failedItemIds: failed };
    }
    if (packageItems.length === 0) {
      await dependencies.repositories.updateJob(input.workspaceId, input.jobId, { status: "FAILED", completedAt: new Date().toISOString(), errorJson: { code: "NO_EXPORTABLE_ITEMS", failedItemIds: failed } });
      return { status: "FAILED", jobId: input.jobId, completedItemIds: completed, failedItemIds: failed };
    }
    const built = buildPackage({ ...input.packageInput, exportJobId: input.jobId, workspaceId: input.workspaceId, items: packageItems });
    for (const file of built.files) {
      const fileRole = file.role as "CREATIVE" | "PREVIEW" | "MANIFEST" | "VALIDATION_REPORT" | "COPY_CSV" | "PACKAGE" | "SOURCE";
      await dependencies.repositories.appendFile({ workspaceId: input.workspaceId, exportJobId: input.jobId, fileObjectId: file.fileId, fileRole, relativePath: file.relativePath, bytes: file.bytes, checksumSha256: file.checksumSha256, exportItemId: fileRole === "CREATIVE" ? completed.find((id) => input.items.find((candidate) => candidate.recordId === id)?.relativePath === file.relativePath) ?? null : null });
    }
    await dependencies.repositories.appendFile({ workspaceId: input.workspaceId, exportJobId: input.jobId, fileObjectId: built.package.fileId, fileRole: "PACKAGE", relativePath: built.package.relativePath, bytes: built.package.bytes, checksumSha256: built.package.checksumSha256, exportItemId: null });
    await dependencies.repositories.updateJob(input.workspaceId, input.jobId, { status: "COMPLETED", manifestJson: built.manifest as unknown as Readonly<Record<string, unknown>>, completedAt: new Date().toISOString(), errorJson: failed.length === 0 ? null : { code: "PARTIAL_SUCCESS", failedItemIds: failed } });
    return { status: failed.length === 0 ? "COMPLETED" : "PARTIAL_SUCCESS", jobId: input.jobId, completedItemIds: completed, failedItemIds: failed, package: built };
  };
}
