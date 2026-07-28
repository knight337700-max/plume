import type { ProductUseCases } from "../../../../../packages/core/src/modules/client-brand/product-use-cases.js";
import { mapProductRows, parseProductImport, type ProductImportRowError } from "../../../../../packages/infrastructure/src/files/product-import-parser.js";

export interface ProductImportWorkerInput { readonly workspaceId: string; readonly brandId: string; readonly filename: string; readonly bytes: Uint8Array }
export interface ProductImportWorkerResult { readonly totalRows: number; readonly succeeded: number; readonly failed: number; readonly errors: readonly ProductImportRowError[]; readonly productIds: readonly string[] }

export function createProductImportWorker(dependencies: { readonly products: ProductUseCases; readonly batchSize?: number }) {
  return async (input: ProductImportWorkerInput): Promise<ProductImportWorkerResult> => {
    const parsed = parseProductImport(input.bytes, input.filename);
    const mapped = mapProductRows(parsed, { workspaceId: input.workspaceId, brandId: input.brandId });
    const errors = [...mapped.errors];
    const productIds: string[] = [];
    const batchSize = Math.max(1, dependencies.batchSize ?? 50);
    for (let offset = 0; offset < mapped.rows.length; offset += batchSize) {
      for (const row of mapped.rows.slice(offset, offset + batchSize)) {
        try { productIds.push((await dependencies.products.create(row.product)).id); } catch (error) { errors.push({ rowNo: row.rowNo, code: "PRODUCT_UPSERT_FAILED", message: error instanceof Error ? error.message : String(error) }); }
      }
    }
    return { totalRows: parsed.length, succeeded: productIds.length, failed: errors.length, errors, productIds };
  };
}
