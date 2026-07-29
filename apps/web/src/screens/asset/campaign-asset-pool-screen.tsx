import { PlumeBadge, PlumeBanner, PlumeButton, PlumeEmptyState, PlumeHeading, PlumeText } from "@plume/ui";
import { AssetRecommendationCard, type CampaignAssetCardProps } from "../../features/asset/asset-recommendation-card.js";

export type LicenseRiskFilter = "all" | "low" | "high";
export interface AssetProductTab { readonly id: string; readonly label: string }
export interface CampaignAssetPoolScreenProps { products?: readonly AssetProductTab[]; assets?: readonly CampaignAssetCardProps[]; activeProductId?: string; licenseRiskFilter?: LicenseRiskFilter; selectedAssetIds?: readonly string[]; onProductTab?: (productId: string) => void; onLicenseRiskFilter?: (filter: LicenseRiskFilter) => void; onSelectionChange?: (assetId: string, isSelected: boolean) => void }

export function CampaignAssetPoolScreen({ products = [], assets = [], activeProductId, licenseRiskFilter = "all", selectedAssetIds = [], onProductTab, onLicenseRiskFilter, onSelectionChange }: CampaignAssetPoolScreenProps) {
  const visibleAssets = assets.filter((asset) => (!activeProductId || asset.productId === activeProductId) && (licenseRiskFilter === "all" || asset.licenseRisk === licenseRiskFilter));
  return (
    <main data-screen-id="ASSET-02" data-screen-state={assets.length === 0 ? "empty" : "ready"}>
      <header><PlumeHeading level={1}>Campaign asset pool</PlumeHeading><PlumeBadge label={`${selectedAssetIds.length} selected`} variant="info" /></header>
      {products.length > 0 ? <nav aria-label="Products"><ul>{products.map((product) => <li key={product.id}><PlumeButton type="button" label={product.label} variant={product.id === activeProductId ? "primary" : "ghost"} {...(onProductTab ? { onClick: () => onProductTab(product.id) } : {})} /></li>)}</ul></nav> : null}
      <div aria-label="License risk filters"><PlumeButton type="button" label="All license risks" variant={licenseRiskFilter === "all" ? "primary" : "ghost"} {...(onLicenseRiskFilter ? { onClick: () => onLicenseRiskFilter("all") } : {})} /><PlumeButton type="button" label="Low risk" variant={licenseRiskFilter === "low" ? "primary" : "ghost"} {...(onLicenseRiskFilter ? { onClick: () => onLicenseRiskFilter("low") } : {})} /><PlumeButton type="button" label="High risk" variant={licenseRiskFilter === "high" ? "primary" : "ghost"} {...(onLicenseRiskFilter ? { onClick: () => onLicenseRiskFilter("high") } : {})} /></div>
      {assets.some((asset) => asset.licenseRisk === "high") ? <PlumeBanner status="warning" title="License risks need review" description="High-risk assets are marked before confirmation." /> : null}
      {visibleAssets.length === 0 ? <PlumeEmptyState title="No matching assets" description="Adjust the product tab or license risk filter." /> : <ul aria-label="Recommended assets">{visibleAssets.map((asset) => <li key={asset.id}><AssetRecommendationCard {...asset} isSelected={selectedAssetIds.includes(asset.id)} onChange={(isSelected) => onSelectionChange?.(asset.id, isSelected)} /></li>)}</ul>}
      <PlumeText type="supporting">Selected assets: {selectedAssetIds.length}</PlumeText>
    </main>
  );
}
