export const creativeRelations = Object.freeze({
  creativeSet: ["workspace", "campaign", "generationRequest"],
  creative: [
    "workspace",
    "creativeSet",
    "campaign",
    "product",
    "formatSelection",
    "currentVersion",
  ],
  creativeVersion: [
    "workspace",
    "creative",
    "parentVersion",
    "formatProfile",
    "layoutTemplate",
    "briefVersion",
    "createdBy",
  ],
  creativeAssetUsage: ["workspace", "creativeVersion", "assetVersion"],
  creativeEditOperation: ["workspace", "creativeVersion", "appliedBy"],
  creativeRender: ["workspace", "creativeVersion", "asyncJob", "fileObject"],
});

export const relations = creativeRelations;
export default creativeRelations;
