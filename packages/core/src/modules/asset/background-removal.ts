export type BackgroundRemovalMode = "AUTO" | "PRODUCT" | "PERSON";

export interface BackgroundRemovalProviderInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly mode: BackgroundRemovalMode;
}

export interface BackgroundRemovalProviderResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly metadataJson?: Readonly<Record<string, unknown>>;
}

export interface BackgroundRemovalProvider {
  remove(input: BackgroundRemovalProviderInput): Promise<BackgroundRemovalProviderResult>;
}

export interface NewAssetVersionWriter {
  createVersion(input: { readonly workspaceId: string; readonly assetId: string; readonly fileObjectId: string; readonly sourceType: string; readonly analysisJson: Readonly<Record<string, unknown>> }): Promise<{ readonly id: string }>;
}

export interface BackgroundRemovalInput {
  readonly workspaceId: string;
  readonly assetId: string;
  readonly sourceVersionId: string;
  readonly sourceFileObjectId: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly mode?: BackgroundRemovalMode;
}

export interface BackgroundRemovalUseCaseDependencies {
  readonly provider: BackgroundRemovalProvider;
  readonly versions: NewAssetVersionWriter;
  readonly outputFileObjectId: (input: BackgroundRemovalProviderResult) => Promise<string>;
}

export function createBackgroundRemovalUseCase(dependencies: BackgroundRemovalUseCaseDependencies) {
  return {
    async execute(input: BackgroundRemovalInput): Promise<{ readonly versionId: string; readonly fileObjectId: string }> {
      const result = await dependencies.provider.remove({ bytes: input.bytes, mimeType: input.mimeType, mode: input.mode ?? "AUTO" });
      const fileObjectId = await dependencies.outputFileObjectId(result);
      const version = await dependencies.versions.createVersion({ workspaceId: input.workspaceId, assetId: input.assetId, fileObjectId, sourceType: "BACKGROUND_REMOVAL", analysisJson: { sourceVersionId: input.sourceVersionId, sourceFileObjectId: input.sourceFileObjectId, backgroundRemovalMode: input.mode ?? "AUTO", ...(result.metadataJson ?? {}) } });
      return { versionId: version.id, fileObjectId };
    },
  };
}
