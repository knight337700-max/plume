import { PlumeBadge, PlumeBanner, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeSkeleton, PlumeText } from "@plume/ui";
import type { UploadFileProgress } from "../../features/upload/upload-controller.js";

export type AssetLibraryState = "loading" | "ready" | "empty" | "error";
export interface AssetLibraryScreenProps { files?: readonly UploadFileProgress[]; state?: AssetLibraryState; onUpload?: () => void }

export function AssetLibraryScreen({ files = [], state = "ready", onUpload }: AssetLibraryScreenProps) {
  return (
    <main data-screen-id="ASSET-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Asset library</PlumeHeading><PlumeButton type="button" label="Upload assets" variant="primary" {...(onUpload ? { onClick: onUpload } : {})} /></header>
      {state === "loading" ? <PlumeSkeleton aria-label="Loading assets" /> : null}
      {state === "error" ? <PlumeBanner status="error" title="Unable to load assets" description="Try again." /> : null}
      {state === "empty" ? <PlumeEmptyState title="No assets" description="Upload product images, logos, or guides." /> : null}
      {state === "ready" && files.length > 0 ? <ul aria-label="Asset uploads">{files.map((file) => <li key={file.id} data-upload-id={file.id}><PlumeText>{file.filename}</PlumeText><PlumeText type="supporting">{file.bytesUploaded} / {file.totalBytes} bytes</PlumeText><PlumeBadge label={`${file.progressPercent}% · ${file.status}`} variant={file.status === "failed" ? "error" : file.status === "completed" ? "success" : "info"} />{file.errorMessage ? <PlumeText type="supporting">{file.errorMessage}</PlumeText> : null}</li>)}</ul> : null}
    </main>
  );
}
