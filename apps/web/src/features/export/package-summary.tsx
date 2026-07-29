import {
  ExportPackageSummary as DomainExportPackageSummary,
  type ExportEligibility,
  type ExportFile,
} from "@plume/ui";
import { PlumeText } from "@plume/ui";

export type ExportFileState = "pending" | "completed" | "failed";

export interface ExportPackageFile extends ExportFile {
  readonly status: ExportFileState;
  readonly signedUrl?: string;
}

export interface ExportPackageSummaryProps {
  version: string;
  eligibility: ExportEligibility;
  fileNaming: string;
  files: readonly ExportPackageFile[];
  blockerReason?: string;
  requiresCompletePackage?: boolean;
  onCreateExport?: () => void;
}

export interface ExportHistoryEntry {
  readonly id: string;
  readonly version: string;
  readonly status: "queued" | "processing" | "completed" | "failed";
  readonly createdAt: string;
  readonly files: readonly ExportPackageFile[];
}

export function hasMissingSignedUrls(files: readonly ExportPackageFile[]) {
  return files.some((file) => file.status === "completed" && !file.signedUrl);
}

export function ExportPackageSummary({
  version,
  eligibility,
  fileNaming,
  files,
  blockerReason,
  requiresCompletePackage = true,
  onCreateExport,
}: ExportPackageSummaryProps) {
  const missingSignedUrls = hasMissingSignedUrls(files);
  const effectiveEligibility = missingSignedUrls ? "blocked" : eligibility;
  const effectiveBlockerReason = missingSignedUrls
    ? "Completed files are not downloadable until signed URLs are available."
    : blockerReason;

  return (
    <section data-plume-feature="package-summary">
      <DomainExportPackageSummary
        version={version}
        eligibility={effectiveEligibility}
        fileNaming={fileNaming}
        files={files}
        requiresCompletePackage={requiresCompletePackage}
        {...(effectiveBlockerReason
          ? { blockerReason: effectiveBlockerReason }
          : {})}
        {...(onCreateExport ? { onCreateExport } : {})}
      />
      {effectiveBlockerReason ? (
        <PlumeText type="supporting" data-export-blocker-reason="true">
          Blocker: {effectiveBlockerReason}
        </PlumeText>
      ) : null}
      <ul data-plume-region="signed-download-files">
        {files.map((file) => (
          <li key={`${file.kind}:${file.name}`} data-export-file-status={file.status}>
            <PlumeText>{file.name}</PlumeText>
            {file.status === "completed" && file.signedUrl ? (
              <a href={file.signedUrl} data-signed-download="true">
                Download {file.name}
              </a>
            ) : null}
            {file.status === "completed" && !file.signedUrl ? (
              <PlumeText type="supporting">Signed download URL pending.</PlumeText>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
