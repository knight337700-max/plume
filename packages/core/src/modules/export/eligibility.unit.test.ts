import { describe, expect, it } from "vitest";
import { assertExportEligible, checkExportEligibility } from "./eligibility.js";

const eligibleInput = {
  creativeVersionId: "version-2",
  currentCreativeVersionId: "version-2",
  approval: { id: "approval-1", status: "APPROVED", creativeVersionId: "version-2", validationRunId: "run-2" },
  validationRun: { id: "run-2", creativeVersionId: "version-2", status: "PASS", summaryJson: { errorCount: 0, warningCount: 0 } },
  validationResults: [],
  assets: [{ id: "asset-1", licenseStatus: "ACTIVE", licenseEndAt: "2026-12-31T23:59:59.000Z" }],
  formatProfile: { id: "format-1", status: "ACTIVE", exportable: true },
  exportRecipe: { id: "recipe-1", status: "ACTIVE" },
  asOf: "2026-07-29T00:00:00.000Z",
} as const;

describe("export eligibility", () => {
  it("allows an approved, validated current version with usable dependencies", () => {
    expect(checkExportEligibility(eligibleInput)).toEqual({ eligible: true, reasons: [] });
    expect(() => assertExportEligible(eligibleInput)).not.toThrow();
  });

  it("returns structured reasons for every export blocker", () => {
    const result = checkExportEligibility({
      ...eligibleInput,
      currentCreativeVersionId: "version-3",
      approval: { ...eligibleInput.approval, creativeVersionId: "version-1", validationRunId: "run-old" },
      validationRun: { ...eligibleInput.validationRun, creativeVersionId: "version-1", summaryJson: { errorCount: 1, warningCount: 1 } },
      validationResults: [
        { id: "error-1", severity: "ERROR", status: "OPEN" },
        { id: "warning-1", severity: "WARNING", status: "OPEN" },
      ],
      assets: [{ id: "asset-expired", licenseStatus: "ACTIVE", licenseEndAt: "2026-07-28T23:59:59.000Z" }],
      formatProfile: { id: "format-1", status: "DRAFT", exportable: true },
      exportRecipe: null,
      revalidationRequired: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons.map((item) => item.code)).toEqual([
      "APPROVAL_VALIDATION_MISMATCH",
      "APPROVAL_VERSION_MISMATCH",
      "ASSET_LICENSE_INVALID",
      "CURRENT_VERSION_MISMATCH",
      "EXPORT_RECIPE_MISSING",
      "FORMAT_NOT_EXPORTABLE",
      "REVALIDATION_REQUIRED",
      "VALIDATION_ERROR_OPEN",
      "VALIDATION_VERSION_MISMATCH",
      "WARNING_ACKNOWLEDGEMENT_REQUIRED",
    ]);
    expect(result.reasons.every((item) => item.code && item.message)).toBe(true);
    expect(() => assertExportEligible({ ...eligibleInput, exportRecipe: null })).toThrow(/eligibility/);
  });

  it("treats a warning as exportable only after its acknowledgement", () => {
    const warning = { id: "warning-1", severity: "WARNING", status: "OPEN" };
    expect(checkExportEligibility({ ...eligibleInput, validationRun: { ...eligibleInput.validationRun, status: "WARNING", summaryJson: { warningCount: 1 } }, validationResults: [warning] }).eligible).toBe(false);
    expect(checkExportEligibility({ ...eligibleInput, validationRun: { ...eligibleInput.validationRun, status: "WARNING", summaryJson: { warningCount: 1 } }, validationResults: [warning], warningAcknowledgementIds: ["warning-1"] }).eligible).toBe(true);
  });
});
