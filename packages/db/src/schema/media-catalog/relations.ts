export const mediaCatalogRelations = Object.freeze({
  productFamily: ["channel"],
  adProduct: ["productFamily"],
  placement: ["channel"],
  guidelineVersion: ["channel"],
  sourceReference: ["guidelineVersion"],
  formatProfile: ["channel", "adProduct", "guidelineVersion", "exportRecipe"],
  formatPlacement: ["formatProfile", "placement"],
  ruleSet: ["guidelineVersion"],
  ruleDefinition: ["ruleSet", "sourceReference"],
  formatRuleSet: ["formatProfile", "ruleSet"],
  layoutTemplate: ["guidelineVersion"],
  formatTemplate: ["formatProfile", "layoutTemplate"],
  catalogOverride: ["workspace"],
});

export const relations = mediaCatalogRelations;
export default mediaCatalogRelations;
