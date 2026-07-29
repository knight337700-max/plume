import { PlumeBanner, PlumeBadge, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeText } from "@plume/ui";

export interface SourceFile { readonly id: string; readonly filename: string; readonly status: "queued" | "uploading" | "analyzing" | "completed" | "failed"; readonly progressPercent: number }
export type SourceUploadState = "idle" | "uploading" | "analyzing" | "ready" | "error";
export interface SourceUploadScreenProps { files?: readonly SourceFile[]; state?: SourceUploadState; analysisJobId?: string; onAddFiles?: () => void; onContinue?: () => void }

export function SourceUploadScreen({ files = [], state = "idle", analysisJobId, onAddFiles, onContinue }: SourceUploadScreenProps) {
  return (
    <main data-screen-id="BRIEF-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Upload campaign sources</PlumeHeading><PlumeButton type="button" label="Add files" variant="secondary" {...(onAddFiles ? { onClick: onAddFiles } : {})} /></header>
      {analysisJobId ? <PlumeBanner status="info" title="Analysis continues in the background" description={`Job ${analysisJobId} is attached to this campaign.`} /> : null}
      {state === "error" ? <PlumeBanner status="error" title="Source analysis failed" description="Retry the analysis after checking the files." /> : null}
      {state === "idle" && files.length === 0 ? <PlumeEmptyState title="No campaign sources" description="Add a brief, promotion details, or brand guide." /> : null}
      {files.length > 0 ? <ul aria-label="Campaign sources">{files.map((file) => <li key={file.id} data-source-id={file.id}><PlumeText>{file.filename}</PlumeText><PlumeBadge label={`${file.progressPercent}% · ${file.status}`} variant={file.status === "failed" ? "error" : file.status === "completed" ? "success" : "info"} /></li>)}</ul> : null}
      {state === "ready" && onContinue ? <PlumeButton type="button" label="Review AI brief" variant="primary" onClick={onContinue} /> : null}
    </main>
  );
}
