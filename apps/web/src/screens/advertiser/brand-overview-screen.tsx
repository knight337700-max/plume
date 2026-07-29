import { PlumeBadge, PlumeBanner, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeText } from "@plume/ui";
import type { BrandSummary } from "../../features/client-brand/api.js";

export type BrandOverviewState = "ready" | "empty" | "not-found" | "no-access";
export interface BrandOverviewScreenProps {
  brand?: BrandSummary;
  state?: BrandOverviewState;
  canEdit?: boolean;
  onEdit?: () => void;
}

export function BrandOverviewScreen({ brand, state = "ready", canEdit = false, onEdit }: BrandOverviewScreenProps) {
  return (
    <main data-screen-id="ADV-02" data-screen-state={state}>
      <header><PlumeHeading level={1}>{brand?.name ?? "Brand overview"}</PlumeHeading>{canEdit ? <PlumeButton type="button" label="Edit brand" variant="secondary" {...(onEdit ? { onClick: onEdit } : {})} /> : null}</header>
      {state === "not-found" ? <PlumeBanner status="error" title="Brand not found" description="This brand may have been removed." /> : null}
      {state === "no-access" ? <PlumeBanner status="error" title="Access unavailable" description="Your role cannot view this brand." /> : null}
      {state === "empty" ? <PlumeEmptyState title="No brand details" description="This brand has no details yet." /> : null}
      {state === "ready" && brand ? <section aria-label="Brand details"><PlumeText>Advertiser: {brand.advertiserId}</PlumeText><PlumeBadge label={`${brand.productCount} products`} variant="neutral" /></section> : null}
    </main>
  );
}
