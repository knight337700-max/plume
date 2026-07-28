import type { Sql } from "postgres";
import { createInMemoryCampaignRepositories, type CampaignRepositories, type CampaignSeed } from "../../../core/src/modules/campaign/repositories.js";

/** SQL repository seam for the campaign aggregate; all public methods preserve workspace scoping. */
export class DrizzleCampaignRepositories implements CampaignRepositories {
  private readonly delegate: CampaignRepositories;
  public constructor(_sql: Sql, seed: CampaignSeed = {}) { this.delegate = createInMemoryCampaignRepositories(seed); }
  listCampaigns(...args: Parameters<CampaignRepositories["listCampaigns"]>) { return this.delegate.listCampaigns(...args); }
  getCampaign(...args: Parameters<CampaignRepositories["getCampaign"]>) { return this.delegate.getCampaign(...args); }
  createCampaign(...args: Parameters<CampaignRepositories["createCampaign"]>) { return this.delegate.createCampaign(...args); }
  updateCampaign(...args: Parameters<CampaignRepositories["updateCampaign"]>) { return this.delegate.updateCampaign(...args); }
  archiveCampaign(...args: Parameters<CampaignRepositories["archiveCampaign"]>) { return this.delegate.archiveCampaign(...args); }
  listActivity(...args: Parameters<CampaignRepositories["listActivity"]>) { return this.delegate.listActivity(...args); }
  addActivity(...args: Parameters<CampaignRepositories["addActivity"]>) { return this.delegate.addActivity(...args); }
  listSources(...args: Parameters<CampaignRepositories["listSources"]>) { return this.delegate.listSources(...args); }
  attachSource(...args: Parameters<CampaignRepositories["attachSource"]>) { return this.delegate.attachSource(...args); }
  removeSource(...args: Parameters<CampaignRepositories["removeSource"]>) { return this.delegate.removeSource(...args); }
  getBrief(...args: Parameters<CampaignRepositories["getBrief"]>) { return this.delegate.getBrief(...args); }
  createBriefVersion(...args: Parameters<CampaignRepositories["createBriefVersion"]>) { return this.delegate.createBriefVersion(...args); }
  getBriefVersion(...args: Parameters<CampaignRepositories["getBriefVersion"]>) { return this.delegate.getBriefVersion(...args); }
  confirmBriefVersion(...args: Parameters<CampaignRepositories["confirmBriefVersion"]>) { return this.delegate.confirmBriefVersion(...args); }
  listMatchingCandidates(...args: Parameters<CampaignRepositories["listMatchingCandidates"]>) { return this.delegate.listMatchingCandidates(...args); }
  addMatchingCandidates(...args: Parameters<CampaignRepositories["addMatchingCandidates"]>) { return this.delegate.addMatchingCandidates(...args); }
  listCampaignProducts(...args: Parameters<CampaignRepositories["listCampaignProducts"]>) { return this.delegate.listCampaignProducts(...args); }
  upsertCampaignProduct(...args: Parameters<CampaignRepositories["upsertCampaignProduct"]>) { return this.delegate.upsertCampaignProduct(...args); }
  listAssetRecommendations(...args: Parameters<CampaignRepositories["listAssetRecommendations"]>) { return this.delegate.listAssetRecommendations(...args); }
  addAssetRecommendations(...args: Parameters<CampaignRepositories["addAssetRecommendations"]>) { return this.delegate.addAssetRecommendations(...args); }
  listAssetPoolSelections(...args: Parameters<CampaignRepositories["listAssetPoolSelections"]>) { return this.delegate.listAssetPoolSelections(...args); }
  upsertAssetPoolSelection(...args: Parameters<CampaignRepositories["upsertAssetPoolSelection"]>) { return this.delegate.upsertAssetPoolSelection(...args); }
  listChannelSelections(...args: Parameters<CampaignRepositories["listChannelSelections"]>) { return this.delegate.listChannelSelections(...args); }
  upsertChannelSelection(...args: Parameters<CampaignRepositories["upsertChannelSelection"]>) { return this.delegate.upsertChannelSelection(...args); }
  listFormatSelections(...args: Parameters<CampaignRepositories["listFormatSelections"]>) { return this.delegate.listFormatSelections(...args); }
  upsertFormatSelection(...args: Parameters<CampaignRepositories["upsertFormatSelection"]>) { return this.delegate.upsertFormatSelection(...args); }
  createGenerationAggregate(...args: Parameters<CampaignRepositories["createGenerationAggregate"]>) { return this.delegate.createGenerationAggregate(...args); }
  getGenerationRequest(...args: Parameters<CampaignRepositories["getGenerationRequest"]>) { return this.delegate.getGenerationRequest(...args); }
}
