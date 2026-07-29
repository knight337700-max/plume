export interface ExportRecipePlanInput {
  readonly id?: string | null;
  readonly packageType?: string | null;
  readonly includeManifest?: boolean;
  readonly includeValidationReport?: boolean;
  readonly includeCopyCsv?: boolean;
  readonly maxPackageBytes?: number | null;
  readonly allowedExtensions?: readonly string[];
}

export interface ExportPackagePlanInput {
  readonly recipe: ExportRecipePlanInput;
  readonly itemCount: number;
}

export interface ExportPackagePlan {
  readonly recipeId: string;
  readonly packageType: string;
  readonly includeManifest: boolean;
  readonly includeValidationReport: boolean;
  readonly includeCopyCsv: boolean;
  readonly maxPackageBytes: number | null;
  readonly allowedExtensions: readonly string[];
  readonly itemCount: number;
}

export function createExportPackagePlan(input: ExportPackagePlanInput): ExportPackagePlan {
  if (!Number.isInteger(input.itemCount) || input.itemCount < 1) {
    throw new Error("An export package must contain at least one item");
  }
  const maxPackageBytes = input.recipe.maxPackageBytes ?? null;
  if (maxPackageBytes !== null && (!Number.isSafeInteger(maxPackageBytes) || maxPackageBytes < 1)) {
    throw new Error("Export recipe maxPackageBytes must be a positive safe integer");
  }
  const allowedExtensions = [...new Set((input.recipe.allowedExtensions ?? []).map((extension) => extension.toLowerCase().replace(/^\./, "")))].sort();
  return Object.freeze({
    recipeId: input.recipe.id ?? "export-recipe",
    packageType: input.recipe.packageType ?? "ZIP",
    includeManifest: input.recipe.includeManifest !== false,
    includeValidationReport: input.recipe.includeValidationReport !== false,
    includeCopyCsv: input.recipe.includeCopyCsv === true,
    maxPackageBytes,
    allowedExtensions: Object.freeze(allowedExtensions),
    itemCount: input.itemCount,
  });
}

export const planExportPackage = createExportPackagePlan;
