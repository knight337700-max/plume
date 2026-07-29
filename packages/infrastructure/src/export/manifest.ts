import { createHash } from "node:crypto";

export interface ExportManifestFile {
  readonly fileId: string;
  readonly relativePath: string;
  readonly role: string;
  readonly bytes: number;
  readonly checksumSha256: string;
}

export interface ExportManifestInput {
  readonly workspaceId?: string;
  readonly workspace?: unknown;
  readonly advertiser?: unknown;
  readonly brand?: unknown;
  readonly campaignId?: string;
  readonly campaign?: unknown;
  readonly creative?: unknown;
  readonly creativeVersion?: unknown;
  readonly product?: unknown;
  readonly channel?: unknown;
  readonly placement?: unknown;
  readonly formatProfile?: unknown;
  readonly guideline?: unknown;
  readonly ruleSet?: unknown;
  readonly template?: unknown;
  readonly exportRecipe?: unknown;
  readonly usedAssetVersions?: readonly unknown[];
  readonly render?: unknown;
  readonly renderEngineVersion?: string;
  readonly validationRun?: unknown;
  readonly validationSummary?: unknown;
  readonly approval?: unknown;
  readonly exportJobId?: string;
  readonly requestedBy?: string;
  readonly exportedAt?: string;
  readonly files: readonly ExportManifestFile[];
}

export interface ExportManifest extends Omit<ExportManifestInput, "files"> {
  readonly schemaVersion: "1.0.0";
  readonly files: readonly ExportManifestFile[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildExportManifest(input: ExportManifestInput): ExportManifest {
  const files = [...input.files].sort((left, right) => left.relativePath.localeCompare(right.relativePath)).map((file) => ({ ...file }));
  return {
    schemaVersion: "1.0.0",
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    ...(input.workspace === undefined ? {} : { workspace: input.workspace }),
    ...(input.advertiser === undefined ? {} : { advertiser: input.advertiser }),
    ...(input.brand === undefined ? {} : { brand: input.brand }),
    ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
    ...(input.campaign === undefined ? {} : { campaign: input.campaign }),
    ...(input.creative === undefined ? {} : { creative: input.creative }),
    ...(input.creativeVersion === undefined ? {} : { creativeVersion: input.creativeVersion }),
    ...(input.product === undefined ? {} : { product: input.product }),
    ...(input.channel === undefined ? {} : { channel: input.channel }),
    ...(input.placement === undefined ? {} : { placement: input.placement }),
    ...(input.formatProfile === undefined ? {} : { formatProfile: input.formatProfile }),
    ...(input.guideline === undefined ? {} : { guideline: input.guideline }),
    ...(input.ruleSet === undefined ? {} : { ruleSet: input.ruleSet }),
    ...(input.template === undefined ? {} : { template: input.template }),
    ...(input.exportRecipe === undefined ? {} : { exportRecipe: input.exportRecipe }),
    ...(input.usedAssetVersions === undefined ? {} : { usedAssetVersions: [...input.usedAssetVersions] }),
    ...(input.render === undefined ? {} : { render: input.render }),
    ...(input.renderEngineVersion === undefined ? {} : { renderEngineVersion: input.renderEngineVersion }),
    ...(input.validationRun === undefined ? {} : { validationRun: input.validationRun }),
    ...(input.validationSummary === undefined ? {} : { validationSummary: input.validationSummary }),
    ...(input.approval === undefined ? {} : { approval: input.approval }),
    ...(input.exportJobId === undefined ? {} : { exportJobId: input.exportJobId }),
    ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
    ...(input.exportedAt === undefined ? {} : { exportedAt: input.exportedAt }),
    files: Object.freeze(files),
  };
}

export const createExportManifest = buildExportManifest;
