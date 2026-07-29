import { PlumeBanner, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";
import { BriefEditor, type BriefField } from "../../features/brief/brief-editor.js";

export type BriefReviewState = "loading" | "ready" | "error" | "confirmed";
export interface BriefReviewScreenProps { fields?: readonly BriefField[]; state?: BriefReviewState; onConfirm?: () => void; onRetry?: () => void }

export function BriefReviewScreen({ fields = [], state = "loading", onConfirm, onRetry }: BriefReviewScreenProps) {
  return (
    <main data-screen-id="BRIEF-02" data-screen-state={state}>
      <PlumeHeading level={1}>Review AI brief</PlumeHeading>
      {state === "loading" ? <PlumeText>Analyzing sources…</PlumeText> : null}
      {state === "error" ? <PlumeBanner status="error" title="Brief analysis failed" description="The source analysis could not be completed." endContent={onRetry ? <PlumeButton label="Retry" variant="ghost" onClick={onRetry} /> : undefined} /> : null}
      {state === "confirmed" ? <PlumeBanner status="success" title="Brief confirmed" description="The confirmed brief can now drive product matching." /> : null}
      {state === "ready" || state === "confirmed" ? <><BriefEditor fields={fields} /><PlumeButton type="button" label="Confirm brief" variant="primary" {...(onConfirm ? { onClick: onConfirm } : {})} isDisabled={state === "confirmed"} /></> : null}
    </main>
  );
}
