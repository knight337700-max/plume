export const projectRelations = Object.freeze({
  project: ["workspace", "campaign", "createdBy"],
  projectAssetReference: ["workspace", "project", "assetVersion", "product", "createdBy"],
});
export const relations = projectRelations;
export default projectRelations;
