import {
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeSkeleton,
  PlumeText,
} from "@plume/ui";
import type { AdvertiserSummary } from "../../features/client-brand/api.js";

export type AdvertiserListState = "loading" | "ready" | "empty" | "error";
export interface AdvertiserListScreenProps {
  items?: readonly AdvertiserSummary[];
  state?: AdvertiserListState;
  nextCursor?: string;
  canCreate?: boolean;
  onCreate?: () => void;
  onNext?: (cursor: string) => void;
  errorMessage?: string;
}

export function AdvertiserListScreen({
  items = [], state = "ready", nextCursor, canCreate = false, onCreate, onNext, errorMessage,
}: AdvertiserListScreenProps) {
  const createButton = canCreate ? (
    <PlumeButton type="button" label="New advertiser" variant="primary" {...(onCreate ? { onClick: onCreate } : {})} />
  ) : null;
  return (
    <main data-screen-id="ADV-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Advertisers</PlumeHeading>{createButton}</header>
      {state === "loading" ? <PlumeSkeleton aria-label="Loading advertisers" /> : null}
      {state === "error" ? <PlumeBanner status="error" title="Unable to load advertisers" description={errorMessage ?? "Try again."} /> : null}
      {state === "empty" ? <PlumeEmptyState title="No advertisers" description="Create an advertiser to organize brands." /> : null}
      {state === "ready" && items.length > 0 ? (
        <ul aria-label="Advertisers" data-cursor-page>
          {items.map((item) => <li key={item.id} data-advertiser-id={item.id}><PlumeText>{item.name}</PlumeText><PlumeText type="supporting">{item.brandCount} brands</PlumeText></li>)}
        </ul>
      ) : null}
      {nextCursor && onNext ? <PlumeButton type="button" label="Next page" variant="ghost" onClick={() => onNext(nextCursor)} /> : null}
    </main>
  );
}
