export type EligibilityReasonCode =
  | "CREATIVE_VERSION_NOT_FOUND"
  | "CURRENT_VERSION_MISMATCH"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_VERSION_MISMATCH"
  | "APPROVAL_VALIDATION_MISMATCH"
  | "VALIDATION_REQUIRED"
  | "VALIDATION_VERSION_MISMATCH"
  | "VALIDATION_NOT_COMPLETE"
  | "VALIDATION_ERROR_OPEN"
  | "WARNING_ACKNOWLEDGEMENT_REQUIRED"
  | "ASSET_LICENSE_INVALID"
  | "FORMAT_NOT_EXPORTABLE"
  | "EXPORT_RECIPE_MISSING"
  | "REVALIDATION_REQUIRED";

export interface ExportEligibilityReason {
  readonly code: EligibilityReasonCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ExportEligibilityInput {
  /** The Creative version requested for export. */
  readonly creativeVersionId?: string | null;
  /** Allows callers that already loaded the version to state its existence explicitly. */
  readonly creativeVersionExists?: boolean;
  readonly currentCreativeVersionId?: string | null;
  readonly approval?: {
    readonly id?: string;
    readonly status?: string | null;
    readonly creativeVersionId?: string | null;
    readonly validationRunId?: string | null;
  } | null;
  readonly validationRun?: {
    readonly id?: string;
    readonly creativeVersionId?: string | null;
    readonly status?: string | null;
    readonly summaryJson?: Readonly<Record<string, unknown>> | null;
  } | null;
  readonly validationResults?: readonly {
    readonly id: string;
    readonly severity: string;
    readonly status: string;
  }[];
  readonly warningAcknowledgementIds?: readonly string[];
  readonly assets?: readonly {
    readonly id?: string;
    readonly licenseStatus?: string | null;
    readonly licenseEndAt?: string | null;
    readonly usageLimitExceeded?: boolean;
  }[];
  readonly formatProfile?: {
    readonly id?: string;
    readonly status?: string | null;
    readonly exportable?: boolean;
  } | null;
  readonly exportRecipe?: {
    readonly id?: string;
    readonly status?: string | null;
  } | null;
  readonly revalidationRequired?: boolean;
  /** Injected clock used for license expiry checks and deterministic tests. */
  readonly asOf?: Date | string;
}

export interface ExportEligibilityResult {
  readonly eligible: boolean;
  readonly reasons: readonly ExportEligibilityReason[];
}

function reason(
  code: EligibilityReasonCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ExportEligibilityReason {
  return details === undefined ? { code, message } : { code, message, details };
}

function asTimestamp(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  return value === undefined ? Date.now() : Date.parse(value);
}

function numericSummaryValue(summary: Readonly<Record<string, unknown>> | null | undefined, key: string): number {
  const value = summary?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);
}

function stableReasonOrder(left: ExportEligibilityReason, right: ExportEligibilityReason): number {
  const codeOrder = left.code.localeCompare(right.code);
  if (codeOrder !== 0) return codeOrder;
  const messageOrder = left.message.localeCompare(right.message);
  if (messageOrder !== 0) return messageOrder;
  return JSON.stringify(left.details ?? {}).localeCompare(JSON.stringify(right.details ?? {}));
}

function activeLicense(status: string | null | undefined): boolean {
  return status === "ACTIVE" || status === "VALID" || status === "LICENSED";
}

function exportableFormat(status: string | null | undefined, exportable: boolean | undefined): boolean {
  if (exportable !== true) return false;
  return status === undefined || status === null || status === "ACTIVE" || status === "PUBLISHED" || status === "READY";
}

function activeRecipe(status: string | null | undefined): boolean {
  return status === undefined || status === null || status === "ACTIVE" || status === "PUBLISHED" || status === "READY";
}

export function checkExportEligibility(input: ExportEligibilityInput): ExportEligibilityResult {
  const reasons: ExportEligibilityReason[] = [];
  const creativeVersionId = input.creativeVersionId ?? null;

  if (!creativeVersionId || input.creativeVersionExists === false) {
    reasons.push(reason("CREATIVE_VERSION_NOT_FOUND", "The Creative version does not exist", { creativeVersionId }));
  }
  if (input.currentCreativeVersionId !== undefined && input.currentCreativeVersionId !== null && creativeVersionId !== input.currentCreativeVersionId) {
    reasons.push(reason("CURRENT_VERSION_MISMATCH", "Export must target the current Creative version", { currentCreativeVersionId: input.currentCreativeVersionId, creativeVersionId }));
  }

  if (!input.approval || input.approval.status !== "APPROVED") {
    reasons.push(reason("APPROVAL_REQUIRED", "An approved approval request is required"));
  } else {
    if (input.approval.creativeVersionId !== creativeVersionId) {
      reasons.push(reason("APPROVAL_VERSION_MISMATCH", "Approval is not for the requested Creative version", { approvedCreativeVersionId: input.approval.creativeVersionId ?? null, creativeVersionId }));
    }
    if (!input.validationRun || !input.approval.validationRunId || input.approval.validationRunId !== input.validationRun.id) {
      reasons.push(reason("APPROVAL_VALIDATION_MISMATCH", "Approval must reference the validation run used for export"));
    }
  }

  if (!input.validationRun) {
    reasons.push(reason("VALIDATION_REQUIRED", "A validation run is required"));
  } else {
    if (input.validationRun.creativeVersionId !== creativeVersionId) {
      reasons.push(reason("VALIDATION_VERSION_MISMATCH", "Validation is not for the requested Creative version", { validatedCreativeVersionId: input.validationRun.creativeVersionId ?? null, creativeVersionId }));
    }
    if (input.validationRun.status !== "PASS" && input.validationRun.status !== "WARNING") {
      reasons.push(reason("VALIDATION_NOT_COMPLETE", "Validation must complete before export", { status: input.validationRun.status ?? null }));
    }
    const errorCount = numericSummaryValue(input.validationRun.summaryJson, "errorCount");
    const openErrors = (input.validationResults ?? []).filter((result) => result.severity === "ERROR" && result.status === "OPEN");
    if (errorCount > 0 || openErrors.length > 0) {
      reasons.push(reason("VALIDATION_ERROR_OPEN", "Open validation errors block export", { errorCount, openErrorResultIds: openErrors.map((result) => result.id).sort() }));
    }
    const openWarnings = (input.validationResults ?? []).filter((result) => result.severity === "WARNING" && result.status === "OPEN");
    const acknowledgedWarningIds = new Set(input.warningAcknowledgementIds ?? []);
    const unacknowledgedWarningIds = openWarnings.filter((result) => !acknowledgedWarningIds.has(result.id)).map((result) => result.id).sort();
    const warningCount = numericSummaryValue(input.validationRun.summaryJson, "warningCount");
    if (unacknowledgedWarningIds.length > 0 || (warningCount > 0 && input.validationResults === undefined)) {
      reasons.push(reason("WARNING_ACKNOWLEDGEMENT_REQUIRED", "Every open warning requires an acknowledgement", { unacknowledgedWarningIds }));
    }
  }

  const asOf = asTimestamp(input.asOf);
  for (const asset of input.assets ?? []) {
    const expiry = asset.licenseEndAt === null || asset.licenseEndAt === undefined ? null : Date.parse(asset.licenseEndAt);
    if (!activeLicense(asset.licenseStatus) || asset.usageLimitExceeded === true || (expiry !== null && (!Number.isFinite(expiry) || expiry <= asOf))) {
      reasons.push(reason("ASSET_LICENSE_INVALID", "An asset has an invalid, expired, or exhausted license", { assetId: asset.id ?? null }));
    }
  }

  if (!input.formatProfile || !exportableFormat(input.formatProfile.status, input.formatProfile.exportable)) {
    reasons.push(reason("FORMAT_NOT_EXPORTABLE", "The selected format profile is not exportable", { formatProfileId: input.formatProfile?.id ?? null, status: input.formatProfile?.status ?? null }));
  }
  if (!input.exportRecipe) {
    reasons.push(reason("EXPORT_RECIPE_MISSING", "An export recipe is required"));
  } else if (!activeRecipe(input.exportRecipe.status)) {
    reasons.push(reason("EXPORT_RECIPE_MISSING", "The selected export recipe is not active", { exportRecipeId: input.exportRecipe.id ?? null, status: input.exportRecipe.status ?? null }));
  }
  if (input.revalidationRequired === true) {
    reasons.push(reason("REVALIDATION_REQUIRED", "The Creative must be revalidated before export"));
  }

  const orderedReasons = reasons.sort(stableReasonOrder);
  return { eligible: orderedReasons.length === 0, reasons: Object.freeze(orderedReasons) };
}

export function assertExportEligible(input: ExportEligibilityInput): void {
  const result = checkExportEligibility(input);
  if (result.eligible) return;
  const error = new Error("Export eligibility check failed");
  Object.assign(error, { code: "EXPORT_INELIGIBLE", statusCode: 409, reasons: result.reasons });
  throw error;
}
