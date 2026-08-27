import type { AssetRepositories } from "../asset/repositories.js";
import type { CampaignRepositories } from "../campaign/repositories.js";
import type { AssetRoleCode } from "./asset-role.js";
import type { ProjectRepositories, ProjectRecord } from "./repositories.js";

export interface EffectiveProjectAsset {
  readonly assetId?: string;
  readonly assetVersionId: string;
  readonly productId: string | null;
  readonly roleCode: AssetRoleCode | null;
  readonly source: "CAMPAIGN" | "PROJECT" | "BOTH";
  readonly sources: readonly ("CAMPAIGN" | "PROJECT")[];
  readonly sourceRoles: readonly AssetRoleCode[];
  readonly inherited: boolean;
  readonly projectMutable: boolean;
  readonly assetStatus?: string;
  readonly licenseStatus?: string;
  readonly eligible: boolean;
  readonly ineligibilityReason?: string;
}
export interface ProjectUseCases {
  list(workspaceId: string, campaignId: string): Promise<readonly ProjectRecord[]>;
  get(workspaceId: string, projectId: string): Promise<ProjectRecord>;
  create(input: {
    workspaceId: string;
    campaignId: string;
    name: string;
    description?: string | null;
  }): Promise<ProjectRecord>;
  update(
    workspaceId: string,
    projectId: string,
    patch: { name?: string; description?: string | null },
    revision?: number,
  ): Promise<ProjectRecord>;
  archive(workspaceId: string, projectId: string, revision?: number): Promise<ProjectRecord>;
  listAssets(
    workspaceId: string,
    projectId: string,
  ): ReturnType<ProjectRepositories["listAssetReferences"]>;
  addAsset(input: {
    workspaceId: string;
    projectId: string;
    assetVersionId: string;
    productId?: string | null;
    roleCode: AssetRoleCode;
    createdBy?: string | null;
  }): ReturnType<ProjectRepositories["addAssetReference"]>;
  removeAsset(workspaceId: string, projectId: string, referenceId: string): Promise<void>;
  effectiveAssets(
    workspaceId: string,
    projectId: string,
  ): Promise<readonly EffectiveProjectAsset[]>;
}
function missing(kind: string): Error {
  return Object.assign(new Error(`${kind} not found`), {
    code: "RESOURCE_NOT_FOUND",
    statusCode: 404,
  });
}

export function createProjectUseCases(deps: {
  projects: ProjectRepositories;
  campaigns: CampaignRepositories;
  assets: AssetRepositories;
}): ProjectUseCases {
  const project = async (workspaceId: string, id: string) => {
    const value = await deps.projects.getProject(workspaceId, id);
    if (!value || value.status === "ARCHIVED") throw missing("Project");
    return value;
  };
  const assertCampaign = async (workspaceId: string, campaignId: string) => {
    const value = await deps.campaigns.getCampaign(workspaceId, campaignId);
    if (!value || value.status === "ARCHIVED") throw missing("Campaign");
    return value;
  };
  return {
    async list(workspaceId, campaignId) {
      await assertCampaign(workspaceId, campaignId);
      return deps.projects.listProjects(workspaceId, campaignId);
    },
    async get(workspaceId, projectId) {
      return project(workspaceId, projectId);
    },
    async create(input) {
      await assertCampaign(input.workspaceId, input.campaignId);
      return deps.projects.createProject(input);
    },
    async update(workspaceId, projectId, patch, revision) {
      await project(workspaceId, projectId);
      return deps.projects.updateProject(workspaceId, projectId, patch, revision);
    },
    async archive(workspaceId, projectId, revision) {
      await project(workspaceId, projectId);
      return deps.projects.archiveProject(workspaceId, projectId, revision);
    },
    async listAssets(workspaceId, projectId) {
      await project(workspaceId, projectId);
      return deps.projects.listAssetReferences(workspaceId, projectId);
    },
    async addAsset(input) {
      const p = await project(input.workspaceId, input.projectId);
      const version = await deps.assets.getVersion(input.workspaceId, input.assetVersionId);
      if (!version) throw missing("Asset version");
      if (input.productId) {
        const products = await deps.campaigns.listCampaignProducts(input.workspaceId, p.campaignId);
        if (!products.some((x) => x.productId === input.productId && x.status === "CONFIRMED"))
          throw Object.assign(new Error("Product is not confirmed for the parent campaign"), {
            code: "PROJECT_PRODUCT_SCOPE_MISMATCH",
            statusCode: 409,
          });
      }
      return deps.projects.addAssetReference(input);
    },
    async removeAsset(workspaceId, projectId, referenceId) {
      await project(workspaceId, projectId);
      return deps.projects.removeAssetReference(workspaceId, projectId, referenceId);
    },
    async effectiveAssets(workspaceId, projectId) {
      const p = await project(workspaceId, projectId);
      const campaign = await deps.campaigns.listAssetPoolSelections(workspaceId, p.campaignId);
      const local = await deps.projects.listAssetReferences(workspaceId, projectId);
      const map = new Map<string, EffectiveProjectAsset>();
      const add = async (
        assetVersionId: string,
        productId: string | null,
        roleCode: AssetRoleCode,
        source: "CAMPAIGN" | "PROJECT",
      ) => {
        const version = await deps.assets.getVersion(workspaceId, assetVersionId);
        const asset = version
          ? await deps.assets.getAsset(workspaceId, version.designAssetId)
          : null;
        const key = `${assetVersionId}:${productId ?? ""}`;
        const prior = map.get(key);
        const sources = [...new Set([...(prior?.sources ?? []), source])];
        const sourceRoles = [...new Set([...(prior?.sourceRoles ?? []), roleCode])];
        const conflict = sourceRoles.length > 1;
        const eligible = Boolean(
          asset && asset.status === "ACTIVE" && asset.licenseStatus === "VALID" && !conflict,
        );
        map.set(key, {
          ...(asset
            ? { assetId: asset.id, assetStatus: asset.status, licenseStatus: asset.licenseStatus }
            : {}),
          assetVersionId,
          productId,
          roleCode: conflict ? null : roleCode,
          source: sources.length === 2 ? "BOTH" : source,
          sources,
          sourceRoles,
          inherited: sources.includes("CAMPAIGN"),
          projectMutable: sources.includes("PROJECT"),
          eligible,
          ...(eligible
            ? {}
            : {
                ineligibilityReason: conflict
                  ? "ASSET_ROLE_CONFLICT"
                  : asset
                    ? `ASSET_${asset.status}_OR_LICENSE_${asset.licenseStatus}`
                    : "ASSET_VERSION_NOT_FOUND",
              }),
        });
      };
      for (const item of campaign.filter((x) => x.status === "SELECTED"))
        await add(item.assetVersionId, item.productId, item.roleCode ?? "REFERENCE", "CAMPAIGN");
      for (const item of local)
        await add(item.assetVersionId, item.productId ?? null, item.roleCode, "PROJECT");
      return [...map.values()];
    },
  };
}
