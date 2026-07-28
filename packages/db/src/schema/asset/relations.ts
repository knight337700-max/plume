export const assetRelations = Object.freeze({
  fileObject: ["workspace", "createdBy"],
  designAsset: ["workspace", "brand", "currentVersion"],
  assetVersion: ["workspace", "designAsset", "fileObject", "createdBy"],
  productAssetLink: ["workspace", "product", "designAsset"],
  assetTag: ["workspace"],
  assetTagLink: ["workspace", "designAsset", "assetTag"],
});

export const relations = assetRelations;
export default assetRelations;
