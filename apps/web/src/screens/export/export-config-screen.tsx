import { PlumeBanner, PlumeHeading, PlumeText } from "@plume/ui";
import {
  ExportPackageSummary,
  type ExportPackageFile,
} from "../../features/export/package-summary.js";

export type ExportConfigState = "idle" | "submitting" | "success" | "error";

export interface ExportConfigScreenProps {
  version?: string;
  fileNaming?: string;
  eligibility?: "eligible" | "blocked" | "pending";
  files?: readonly ExportPackageFile[];
  blockerReasons?: readonly string[];
  state?: ExportConfigState;
  onCreateExport?: () => void;
}

export function ExportConfigScreen({
  version = "v1",
  fileNaming = "{campaign}_{version}_{format}",
  eligibility = "pending",
  files = [],
  blockerReasons = [],
  state = "idle",
  onCreateExport,
}: ExportConfigScreenProps) {
  const blockerReason = blockerReasons.length > 0 ? blockerReasons.join(" ") : undefined;

  return (
    <main data-screen-id="EXPORT-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Configure export</PlumeHeading>
        <PlumeText type="supporting">
          Confirm the package manifest and eligibility before submitting an export job.
        </PlumeText>
      </header>
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Export could not start"
          description="Resolve the package blockers and try again."
        />
      ) : null}
      {blockerReasons.length > 0 ? (
        <section data-plume-region="export-eligibility-blockers" aria-label="Export blockers">
          <PlumeText>Eligibility blockers before submit:</PlumeText>
          <ul>
            {blockerReasons.map((reason) => <li key={reason}><PlumeText type="supporting">{reason}</PlumeText></li>)}
          </ul>
        </section>
      ) : null}
      <ExportPackageSummary
        version={version}
        eligibility={eligibility}
        fileNaming={fileNaming}
        files={files}
        {...(blockerReason ? { blockerReason } : {})}
        {...(onCreateExport ? { onCreateExport } : {})}
      />
    </main>
  );
}
