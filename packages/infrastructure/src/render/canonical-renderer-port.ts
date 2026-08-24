import type {
  CreativeLayoutPlan,
  FreeformRenderResult,
  RendererIntegrationOutputV1,
  RendererValidationIssue,
} from "@plume/renderer-vendor";
import type { SemanticPlacementEvidence } from "./semantic-placement-evidence.js";

export interface CanonicalRendererTemplateRequest {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly plumeFormatProfileId: string;
  readonly advertiser: string;
  readonly headline: string;
  readonly subcopy: string;
  readonly productAsset: {
    readonly token: string;
    readonly mimeType: "image/png" | "image/jpeg";
    readonly checksumSha256: string;
    readonly declaredWidth?: number;
    readonly declaredHeight?: number;
  };
  /** Required only for the activated semantic thumbnail binding. */
  readonly semanticPlacement?: SemanticPlacementEvidence;
}

export interface CanonicalRendererFreeformAsset {
  readonly assetId: string;
  readonly token: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly checksumSha256: string;
  readonly declaredWidth?: number;
  readonly declaredHeight?: number;
}

export interface CanonicalRendererFreeformRequest {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly plumeFormatProfileId: string;
  readonly layoutMode: "FREEFORM";
  readonly creativeLayoutPlan: CreativeLayoutPlan;
  readonly assets: readonly CanonicalRendererFreeformAsset[];
  readonly output: Readonly<{
    readonly mimeType: "image/png";
    readonly format: "PNG";
  }>;
}

export type CanonicalRendererRequest =
  | CanonicalRendererTemplateRequest
  | CanonicalRendererFreeformRequest;

export interface CanonicalRendererMetadata extends Readonly<Record<string, unknown>> {
  readonly rendererRepository: "knight337700-max/plume-renderer";
  readonly rendererCommit: "7baa272dd852ed21a09cf369c928571b3f75fd31";
  readonly rendererIntegrationContract: "1.8.0";
  readonly rendererRuntimeVersion: string;
  readonly legacyFallbackUsed: false;
  readonly rendererIntegrationOutput?: RendererIntegrationOutputV1;
  readonly formatProfileId?: string;
  readonly requestFingerprint?: string;
  readonly pixelFingerprint?: string;
  readonly renderFingerprint?: string;
  readonly artifactChecksumSha256?: string;
  readonly artifactFormat?: "PNG" | "JPEG";
  readonly appliedElements?: FreeformRenderResult["appliedElements"];
  readonly rendererWarnings?: readonly RendererValidationIssue[];
}

interface CanonicalRendererResultBase {
  readonly requestId: string;
  readonly outputFileId: null;
  readonly warnings: readonly string[];
  readonly renderMetadata: CanonicalRendererMetadata;
}

export type CanonicalRendererResult =
  | (CanonicalRendererResultBase & {
      readonly status: "COMPLETED";
      readonly width: number;
      readonly height: number;
      readonly bytes: number;
      readonly checksumSha256: string;
      readonly outputBytes: Uint8Array;
      readonly error: null;
    })
  | (CanonicalRendererResultBase & {
      readonly status: "FAILED";
      readonly width: null;
      readonly height: null;
      readonly bytes: null;
      readonly checksumSha256: null;
      readonly outputBytes: null;
      readonly error: Readonly<Record<string, unknown>>;
    });

export interface CanonicalRendererPort {
  render(request: CanonicalRendererRequest): Promise<CanonicalRendererResult>;
}
