import { analyzeImage, type ImageAnalysis } from "../../../../../packages/infrastructure/src/images/analyze-image.js";

export interface ImageAnalysisSource {
  read(objectKey: string): Promise<Uint8Array>;
}

export interface ImageAnalysisStore {
  save(workspaceId: string, assetVersionId: string, analysis: ImageAnalysis): Promise<void>;
}

export interface AnalyzeImageInput {
  readonly workspaceId: string;
  readonly assetVersionId: string;
  readonly objectKey: string;
  readonly mimeType: string;
}

export interface AnalyzeImageResult {
  readonly assetVersionId: string;
  readonly status: "COMPLETED" | "FAILED";
  readonly analysis?: ImageAnalysis;
  readonly error?: { readonly code: string; readonly message: string };
}

export function createImageAnalysisHandler(dependencies: { readonly source: ImageAnalysisSource; readonly store: ImageAnalysisStore }) {
  return async (input: AnalyzeImageInput): Promise<AnalyzeImageResult> => {
    try {
      const analysis = analyzeImage(await dependencies.source.read(input.objectKey), input.mimeType);
      await dependencies.store.save(input.workspaceId, input.assetVersionId, analysis);
      return { assetVersionId: input.assetVersionId, status: "COMPLETED", analysis };
    } catch (error) {
      const itemError = error instanceof Error ? error : new Error(String(error));
      return { assetVersionId: input.assetVersionId, status: "FAILED", error: { code: (itemError as Error & { code?: string }).code ?? "IMAGE_ANALYSIS_FAILED", message: itemError.message } };
    }
  };
}

export function createInMemoryImageAnalysisStore(): ImageAnalysisStore & { readonly values: ReadonlyMap<string, ImageAnalysis> } {
  const values = new Map<string, ImageAnalysis>();
  return { values, async save(_workspaceId, assetVersionId, analysis) { values.set(assetVersionId, analysis); } };
}
