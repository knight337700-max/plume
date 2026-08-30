export type Collection<T> = { readonly items: readonly T[] };
export type Resource<T> = { readonly data: T };

export interface CampaignRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly brandId: string;
  readonly displayCode?: string;
  readonly name: string;
  readonly objectiveCode?: string;
  readonly status: string;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly revisionNo: number;
}

export interface ProjectRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly campaignId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status: string;
  readonly revisionNo: number;
  readonly updatedAt: string;
}

export interface EffectiveAssetRecord {
  readonly id?: string;
  readonly referenceId?: string;
  readonly assetId?: string;
  readonly assetVersionId: string;
  readonly productId?: string | null;
  readonly roleCode?: string | null;
  readonly source?: "CAMPAIGN" | "PROJECT" | "BOTH";
  readonly eligible?: boolean;
  readonly licenseStatus?: string;
  readonly name?: string;
}

export interface ProjectAssetReferenceRecord {
  readonly id: string;
  readonly assetVersionId: string;
  readonly productId?: string | null;
  readonly roleCode: string;
  readonly createdAt: string;
}

export interface AssetUsageRecord {
  readonly id: string;
  readonly assetVersionId: string;
  readonly creativeVersionId: string;
  readonly creativeId: string;
  readonly creativeSetId: string;
  readonly projectId: string | null;
}

export interface ChannelSelectionRecord {
  readonly id: string;
  readonly channelCode: string;
  readonly status: string;
}

export interface FormatOptionRecord {
  readonly id?: string;
  readonly profileId?: string;
  readonly formatProfileId?: string;
  readonly channelCode: string;
  readonly name?: string;
  readonly displayName?: string;
  readonly width?: number;
  readonly height?: number;
  readonly spec?: Readonly<{ readonly width?: number; readonly height?: number }>;
  readonly availability?: string;
  readonly status?: string;
  readonly reason?: string;
}

export interface CampaignFormatSelectionRecord {
  readonly id: string;
  readonly channelCode: string;
  readonly formatProfileId: string;
  readonly profileVersion: string;
  readonly status: "SELECTED" | "REMOVED";
}

export interface CreativeSetRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly projectId?: string | null;
  readonly name: string;
  readonly generationRequestId?: string | null;
  readonly status: string;
  readonly updatedAt: string;
}

export interface CreativeRecord {
  readonly id: string;
  readonly creativeSetId: string;
  readonly campaignId: string;
  readonly productId?: string | null;
  readonly campaignFormatSelectionId: string;
  readonly currentVersionId?: string | null;
  readonly status: string;
  readonly revisionNo: number;
}

export interface CreativeVersionRecord {
  readonly id: string;
  readonly creativeId: string;
  readonly versionNo: number;
  readonly formatProfileId: string;
  readonly status: string;
  readonly revisionNo: number;
  readonly documentJson: {
    readonly id?: string;
    readonly formatProfileId?: string;
    readonly width?: number;
    readonly height?: number;
    readonly elements?: readonly Record<string, unknown>[];
    readonly [key: string]: unknown;
  };
}

export interface CreativeRenderRecord {
  readonly id: string;
  readonly creativeVersionId: string;
  readonly renderPurpose: string;
  readonly status: "COMPLETED" | "FAILED";
  readonly createdAt: string;
}

export interface DownloadUrlRecord {
  readonly url: string;
  readonly expiresAt: string;
  readonly filename: string;
}

export interface JobRecord {
  readonly id: string;
  readonly jobType?: string;
  readonly status: string;
  readonly progressPercent: number;
  readonly attemptNo: number;
  readonly maxAttempts: number;
}

export interface JobItemRecord {
  readonly id: string;
  readonly jobId: string;
  readonly itemKey: string;
  readonly status: string;
  readonly progressPercent: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

export const channelLabels: Readonly<Record<string, string>> = {
  KAKAO_MOMENT: "Kakao Moment",
  NAVER_GFA: "Naver GFA",
  META: "Meta",
  GOOGLE_ADS: "Google Ads",
};

export function formatOptionId(option: FormatOptionRecord): string {
  return option.id ?? option.profileId ?? option.formatProfileId ?? "";
}

export function formatOptionLabel(option: FormatOptionRecord): string {
  const width = option.width ?? option.spec?.width;
  const height = option.height ?? option.spec?.height;
  const dimensions = width && height ? ` · ${width} × ${height}` : "";
  return `${option.displayName ?? option.name ?? formatOptionId(option)}${dimensions}`;
}

/** Editor preview authority: newest PREVIEW, falling back to newest FINAL_EXPORT. */
export function selectPrimaryRender(
  renders: readonly CreativeRenderRecord[],
): CreativeRenderRecord | undefined {
  const completed = renders.filter((render) => render.status === "COMPLETED");
  for (const purpose of ["PREVIEW", "FINAL_EXPORT"] as const) {
    const candidates = completed
      .filter((render) => render.renderPurpose === purpose)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    if (candidates[0]) return candidates[0];
  }
  return undefined;
}
