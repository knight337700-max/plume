import type { ReactNode } from "react";
import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeStatusDot,
  PlumeText,
} from "../components/index.js";

export type ExportEligibility = "eligible" | "blocked" | "pending";

export interface ExportFile {
  name: string;
  kind: string;
  sizeLabel?: string;
}

export interface ExportPackageSummaryProps {
  version: string;
  eligibility: ExportEligibility;
  fileNaming: string;
  files: readonly ExportFile[];
  recipe?: ReactNode;
  validationReport?: ReactNode;
  manifest?: ReactNode;
  blockerReason?: ReactNode;
  requiresCompletePackage?: boolean;
  onCreateExport?: () => void;
}

const eligibilityLabels: Record<ExportEligibility, string> = {
  eligible: "Eligible to export",
  blocked: "Export blocked",
  pending: "Eligibility pending",
};

export function ExportPackageSummary({
  version,
  eligibility,
  fileNaming,
  files,
  recipe,
  validationReport,
  manifest,
  blockerReason,
  requiresCompletePackage = true,
  onCreateExport,
}: ExportPackageSummaryProps) {
  const canExport = eligibility === "eligible";

  return (
    <section
      aria-label="Export package summary"
      data-plume-component="export-package-summary"
      data-export-eligibility={eligibility}
    >
      <PlumeStatusDot
        variant={eligibility === "eligible" ? "success" : eligibility === "blocked" ? "error" : "warning"}
        label={eligibilityLabels[eligibility]}
      />
      <PlumeBadge
        label={eligibilityLabels[eligibility]}
        variant={eligibility === "eligible" ? "success" : eligibility === "blocked" ? "error" : "warning"}
      />
      <PlumeText>Creative version: {version}</PlumeText>
      <PlumeText type="supporting">File naming: {fileNaming}</PlumeText>
      <PlumeText type="supporting">
        Complete package required: {requiresCompletePackage ? "Yes" : "No"}
      </PlumeText>
      {blockerReason ? (
        <PlumeBanner
          status={eligibility === "blocked" ? "error" : "warning"}
          title="Export eligibility"
          description={blockerReason}
          data-plume-region="export-blocker"
        />
      ) : null}
      <ul data-plume-region="export-files">
        {files.map((file) => (
          <li key={`${file.kind}:${file.name}`}>
            <PlumeText>{file.name}</PlumeText>
            <PlumeText type="supporting">
              {file.kind}{file.sizeLabel ? ` · ${file.sizeLabel}` : ""}
            </PlumeText>
          </li>
        ))}
      </ul>
      {recipe ? <PlumeText type="supporting">Recipe: {recipe}</PlumeText> : null}
      {validationReport ? (
        <PlumeText type="supporting">Validation report: {validationReport}</PlumeText>
      ) : null}
      {manifest ? <PlumeText type="supporting">Manifest: {manifest}</PlumeText> : null}
      {onCreateExport ? (
        <PlumeButton
          type="button"
          label="Create export package"
          variant="primary"
          isDisabled={!canExport}
          {...(!canExport
            ? { disabledReason: "Resolve export eligibility blockers first." }
            : {})}
          onClick={onCreateExport}
        />
      ) : null}
    </section>
  );
}
