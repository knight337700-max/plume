import { PlumeBanner, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";
import { ProductMatchCard, type MatchingProductCardProps } from "../../features/matching/product-match-card.js";

export type ProductMatchingState = "loading" | "ready" | "error" | "confirmed";
export interface ProductMatchingScreenProps { sourceProductCount?: number; candidates?: readonly MatchingProductCardProps[]; state?: ProductMatchingState; onConfirm?: (candidateId: string) => void; onExclude?: (candidateId: string) => void; onCreateNew?: (sourceProduct: string) => void }

export function ProductMatchingScreen({ sourceProductCount = 0, candidates = [], state = "ready", onConfirm, onExclude, onCreateNew }: ProductMatchingScreenProps) {
  return (
    <main data-screen-id="MATCH-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Product matching</PlumeHeading><PlumeText type="supporting">{sourceProductCount} source products need confirmation.</PlumeText></header>
      {state === "loading" ? <PlumeText>Finding product candidates…</PlumeText> : null}
      {state === "error" ? <PlumeBanner status="error" title="Matching failed" description="Try matching again." /> : null}
      {state === "confirmed" ? <PlumeBanner status="success" title="Products confirmed" description="The campaign can continue to asset selection." /> : null}
      <ul aria-label="Product candidates">{candidates.map((candidate) => <li key={candidate.candidateId}><ProductMatchCard {...candidate} {...(onConfirm ? { onConfirm: () => onConfirm(candidate.candidateId) } : {})} {...(onExclude ? { onExclude: () => onExclude(candidate.candidateId) } : {})} {...(onCreateNew ? { onCreateNew: () => onCreateNew(candidate.sourceProduct) } : {})} /></li>)}</ul>
      {state === "ready" && candidates.length === 0 ? <PlumeButton type="button" label="Create new product" variant="secondary" {...(onCreateNew ? { onClick: () => onCreateNew("source product") } : {})} /> : null}
    </main>
  );
}
