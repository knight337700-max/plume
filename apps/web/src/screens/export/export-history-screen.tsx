import {
  PlumeBadge,
  PlumeBanner,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
} from "@plume/ui";
import type { ExportHistoryEntry } from "../../features/export/package-summary.js";

export type ExportHistoryState = "loading" | "ready" | "empty" | "error";

export interface ExportHistoryScreenProps {
  entries?: readonly ExportHistoryEntry[];
  state?: ExportHistoryState;
}

export function ExportHistoryScreen({
  entries = [],
  state = entries.length === 0 ? "empty" : "ready",
}: ExportHistoryScreenProps) {
  return (
    <main data-screen-id="EXPORT-02" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Export history</PlumeHeading>
        <PlumeText type="supporting">Download completed packages from signed URLs.</PlumeText>
      </header>
      {state === "loading" ? <PlumeText>Loading export history…</PlumeText> : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Export history unavailable"
          description="Try refreshing the export history."
        />
      ) : null}
      {state === "empty" ? (
        <PlumeEmptyState
          title="No exports yet"
          description="Completed export packages will appear here."
        />
      ) : null}
      {state === "ready" ? (
        <ol aria-label="Export history">
          {entries.map((entry) => (
            <li key={entry.id} data-export-id={entry.id}>
              <PlumeText>Version {entry.version}</PlumeText>
              <PlumeText type="supporting">Created {entry.createdAt}</PlumeText>
              <PlumeBadge label={entry.status} variant={entry.status === "completed" ? "success" : entry.status === "failed" ? "error" : "info"} />
              <ul data-export-region="history-files">
                {entry.files.map((file) => (
                  <li key={`${file.kind}:${file.name}`} data-history-file-status={file.status}>
                    <PlumeText>{file.name}</PlumeText>
                    {entry.status === "completed" && file.status === "completed" && file.signedUrl ? (
                      <a href={file.signedUrl} data-signed-download="true">
                        Download file
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
