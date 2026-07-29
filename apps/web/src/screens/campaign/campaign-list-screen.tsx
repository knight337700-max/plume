import { PlumeBanner, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeSkeleton, PlumeText } from "@plume/ui";
import type { CampaignSummary } from "../../features/client-brand/api.js";

export type CampaignListState = "loading" | "ready" | "empty" | "error";
export interface CampaignListScreenProps {
  items?: readonly CampaignSummary[];
  state?: CampaignListState;
  nextCursor?: string;
  canCreate?: boolean;
  onCreate?: () => void;
  onNext?: (cursor: string) => void;
}

export function CampaignListScreen({ items = [], state = "ready", nextCursor, canCreate = false, onCreate, onNext }: CampaignListScreenProps) {
  return (
    <main data-screen-id="CAMP-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Campaigns</PlumeHeading>{canCreate ? <PlumeButton type="button" label="New campaign" variant="primary" {...(onCreate ? { onClick: onCreate } : {})} /> : null}</header>
      {state === "loading" ? <PlumeSkeleton aria-label="Loading campaigns" /> : null}
      {state === "error" ? <PlumeBanner status="error" title="Unable to load campaigns" description="Try again." /> : null}
      {state === "empty" ? <PlumeEmptyState title="No campaigns" description="Create a campaign to begin a workflow." /> : null}
      {state === "ready" && items.length > 0 ? <ul aria-label="Campaigns" data-cursor-page>{items.map((item) => <li key={item.id} data-campaign-id={item.id}><PlumeText>{item.name}</PlumeText><PlumeText type="supporting">{item.currentStep} · {item.status}</PlumeText></li>)}</ul> : null}
      {nextCursor && onNext ? <PlumeButton type="button" label="Next page" variant="ghost" onClick={() => onNext(nextCursor)} /> : null}
    </main>
  );
}
