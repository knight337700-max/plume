import { PlumeBadge, PlumeBanner, PlumeHeading, PlumeText } from "@plume/ui";
import type { ProductSummary } from "./product-list-screen.js";

export interface ProductDetailScreenProps { product?: ProductSummary; state?: "ready" | "loading" | "not-found" | "no-access" }

export function ProductDetailScreen({ product, state = "ready" }: ProductDetailScreenProps) {
  return (
    <main data-screen-id="PROD-02" data-screen-state={state}>
      <PlumeHeading level={1}>{product?.name ?? "Product detail"}</PlumeHeading>
      {state === "loading" ? <PlumeText>Loading product…</PlumeText> : null}
      {state === "not-found" ? <PlumeBanner status="error" title="Product not found" description="The requested product does not exist." /> : null}
      {state === "no-access" ? <PlumeBanner status="error" title="Access unavailable" description="Your role cannot view this product." /> : null}
      {state === "ready" && product ? <section aria-label="Product details"><PlumeText>SKU: {product.sku ?? "Not assigned"}</PlumeText><PlumeBadge label={`${product.assetCount} linked assets`} variant="neutral" /></section> : null}
    </main>
  );
}
