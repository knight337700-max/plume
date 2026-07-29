import { AssetRecommendationCard as DomainAssetRecommendationCard, type AssetRecommendationCardProps } from "@plume/ui";

export type CampaignAssetCardProps = AssetRecommendationCardProps & { readonly productId: string; readonly licenseRisk: "low" | "high" };

export function AssetRecommendationCard({ productId, licenseRisk, ...props }: CampaignAssetCardProps) {
  return <div data-product-id={productId} data-license-risk={licenseRisk}><DomainAssetRecommendationCard {...props} /></div>;
}
