export const campaignRelations = Object.freeze({
  campaign: ["workspace", "brand", "ownerUser"],
  campaignSource: ["workspace", "campaign", "fileObject", "uploadedBy"],
  campaignSourceAnalysis: ["workspace", "campaignSource", "asyncJob"],
  campaignBrief: ["workspace", "campaign", "currentVersion", "currentConfirmedVersion"],
  campaignBriefVersion: ["workspace", "campaignBrief", "parentVersion", "createdBy"],
  campaignProduct: ["workspace", "campaign", "product", "briefVersion"],
  campaignAsset: ["workspace", "campaign", "designAsset", "product"],
  campaignChannelSelection: ["workspace", "campaign", "channel"],
  campaignFormatSelection: [
    "workspace",
    "campaign",
    "channelSelection",
    "formatProfile",
    "layoutTemplate",
  ],
  generationRequest: [
    "workspace",
    "campaign",
    "briefVersion",
    "creativeSet",
    "asyncJob",
    "requestedBy",
  ],
  generationRequestItem: [
    "workspace",
    "generationRequest",
    "product",
    "formatSelection",
    "creative",
  ],
});

export const relations = campaignRelations;
export default campaignRelations;
