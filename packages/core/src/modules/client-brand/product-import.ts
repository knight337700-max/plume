import { randomUUID } from "node:crypto";
import type { OutboxRepository } from "../operations/outbox-repository.js";
import type { TransactionManager } from "../../common/transaction.js";
import type { ProductRecord, ProductVariantRecord } from "./repositories.js";

export interface ProductImportRow { readonly rowNo: number; readonly product: Omit<ProductRecord, "id" | "revisionNo" | "normalizedName" | "status">; readonly variants?: readonly Omit<ProductVariantRecord, "id" | "revisionNo" | "status">[] }
export interface ImportJobRecord { readonly id: string; readonly workspaceId: string; readonly status: "QUEUED"; readonly totalRows: number }
export interface ImportJobWriter { createJob(input: { readonly workspaceId: string; readonly totalRows: number; readonly type: string }): Promise<ImportJobRecord> }
export interface ProductImportDependencies { readonly transactions?: TransactionManager; readonly jobs?: ImportJobWriter; readonly outbox?: OutboxRepository }
export interface ProductImportCommand { readonly job: ImportJobRecord; readonly outboxId: string }

export async function createProductImportCommand(workspaceId: string, rows: readonly ProductImportRow[], dependencies: ProductImportDependencies = {}): Promise<ProductImportCommand> {
  const work = async (): Promise<ProductImportCommand> => {
    const job = dependencies.jobs ? await dependencies.jobs.createJob({ workspaceId, totalRows: rows.length, type: "product.import" }) : { id: randomUUID(), workspaceId, status: "QUEUED" as const, totalRows: rows.length };
    const outbox = dependencies.outbox ? await dependencies.outbox.insert({ workspaceId, topic: "product.import", messageKey: job.id, messageType: "ProductImportRequested", schemaVersion: 1, payloadJson: { jobId: job.id, rows } }) : null;
    return { job, outboxId: outbox?.id ?? randomUUID() };
  };
  return dependencies.transactions ? dependencies.transactions.withTransaction(async () => work()) : work();
}
