export const clientBrandRelations = Object.freeze({
  advertiser: ["workspace", "ownerUser"],
  brand: ["workspace", "advertiser", "logoAsset"],
  brandProfile: ["workspace", "brand"],
  product: ["workspace", "brand", "representativeAsset"],
  productVariant: ["workspace", "product"],
});

export const relations = clientBrandRelations;
export default clientBrandRelations;
