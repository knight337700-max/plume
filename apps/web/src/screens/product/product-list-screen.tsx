import { PlumeBanner, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeSkeleton, PlumeText } from "@plume/ui";

export interface ProductSummary { readonly id: string; readonly name: string; readonly sku?: string; readonly assetCount: number }
export type ProductListState = "loading" | "ready" | "empty" | "error" | "partial_error";
export interface ProductListScreenProps {
  items?: readonly ProductSummary[];
  state?: ProductListState;
  importFailures?: readonly string[];
  canCreate?: boolean;
  onCreate?: () => void;
}

export function ProductListScreen({ items = [], state = "ready", importFailures = [], canCreate = false, onCreate }: ProductListScreenProps) {
  return (
    <main data-screen-id="PROD-01" data-screen-state={state}>
      <header><PlumeHeading level={1}>Products</PlumeHeading>{canCreate ? <PlumeButton type="button" label="Import products" variant="primary" {...(onCreate ? { onClick: onCreate } : {})} /> : null}</header>
      {state === "loading" ? <PlumeSkeleton aria-label="Loading products" /> : null}
      {state === "error" ? <PlumeBanner status="error" title="Unable to load products" description="Try again." /> : null}
      {state === "partial_error" || importFailures.length > 0 ? <><PlumeBanner status="warning" title="Import partially completed" description={`${importFailures.length} product rows could not be imported.`} /><ul data-partial-import-failures aria-label="Import failures">{importFailures.map((failure) => <li key={failure}>{failure}</li>)}</ul></> : null}
      {state === "empty" ? <PlumeEmptyState title="No products" description="Import products to build your product library." /> : null}
      {state !== "loading" && state !== "empty" && items.length > 0 ? <ul aria-label="Products">{items.map((item) => <li key={item.id} data-product-id={item.id}><PlumeText>{item.name}</PlumeText><PlumeText type="supporting">{item.sku ?? "No SKU"} · {item.assetCount} assets</PlumeText></li>)}</ul> : null}
    </main>
  );
}
