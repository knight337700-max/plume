import type { CatalogRepository } from "../../../../../packages/core/src/modules/media-catalog/repositories.js";

export interface CatalogIntegrityFinding {
  profileId: string;
  code: "MISSING_RULE_SET" | "MISSING_EXPORT_RECIPE" | "PENDING_VERIFY";
  severity: "ERROR" | "WARNING";
  message: string;
}

export interface CatalogIntegrityReport {
  status: "PASS" | "PASS_WITH_KNOWN_EXCEPTIONS" | "FAILED";
  checked: number;
  findings: readonly CatalogIntegrityFinding[];
}

export async function checkCatalogIntegrity(
  repository: CatalogRepository,
): Promise<CatalogIntegrityReport> {
  const profiles = await repository.listFormatProfiles(undefined, undefined, true);
  const findings: CatalogIntegrityFinding[] = [];

  for (const profile of profiles) {
    if (!profile.ruleSetId) {
      findings.push({
        profileId: profile.id,
        code: "MISSING_RULE_SET",
        severity: "ERROR",
        message: "Format profile references no rule set.",
      });
    }

    if (!profile.exportRecipeId) {
      findings.push({
        profileId: profile.id,
        code: "MISSING_EXPORT_RECIPE",
        severity: "ERROR",
        message: "Format profile references no export recipe.",
      });
    }

    if (profile.status === "PENDING_VERIFY") {
      findings.push({
        profileId: profile.id,
        code: "PENDING_VERIFY",
        severity: "WARNING",
        message: "Format profile is awaiting catalog verification.",
      });
    }
  }

  const hasErrors = findings.some((finding) => finding.severity === "ERROR");
  return {
    status: hasErrors ? "FAILED" : findings.length > 0 ? "PASS_WITH_KNOWN_EXCEPTIONS" : "PASS",
    checked: profiles.length,
    findings,
  };
}

export function createCatalogIntegrityHandler(repository: CatalogRepository) {
  return async (): Promise<CatalogIntegrityReport> => checkCatalogIntegrity(repository);
}
