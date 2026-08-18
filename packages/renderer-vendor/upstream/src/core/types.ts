export type Severity = "ERROR" | "WARNING" | "INFO";

export type ValidationStage = "PRE_RENDER" | "POST_RENDER";

export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ValidationIssue = {
  code: string;
  severity: Severity;
  path: string;
  messageKey: string;
  stage?: ValidationStage;
  expected?: unknown;
  actual?: unknown;
  bbox?: BBox | null;
  imageSlotId?: string;
  slotRole?: "IMAGE" | "LOGO";
  assetId?: string;
  elementId?: string;
  formatProfileId?: string;
};

export type FreeformValidationIssue = Omit<ValidationIssue, "stage"> & {
  stage: ValidationStage;
};

export type FreeformAppliedElement = {
  elementId: string;
  elementType: "IMAGE" | "TEXT" | "LOGO" | "SHAPE";
  normalizedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  destinationPixelRect: BBox;
  /** Alpha>=8 raster bounds captured from the isolated element render. */
  actualRasterBounds?: BBox;
  zIndex: number;
  originalArrayIndex: number;
  opacity: number;
  assetId?: string;
  assetDigest?: string;
  requestedCropRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  resolvedSourceCropPixels?: BBox;
  fontId?: string;
  fontAssetDigest?: string;
  placementPolicy?: "ALPHA_TRIM_CONTAIN" | "CENTER_CONTAIN" | "SEMANTIC_CROP_COVER" | "MANUAL_CROP";
  fitMode?: "CONTAIN" | "COVER";
  fontSizePx?: number;
  lineHeightPx?: number;
  color?: string;
  wrapMode?: "NO_WRAP" | "EXPLICIT_NEWLINES" | "WORD_WRAP";
  overflowMode?: "ERROR" | "CLIP";
  overflowDetected?: boolean;
  clipped?: boolean;
  safeZoneImportance?: "KEY_CREATIVE" | "DECORATIVE" | "IGNORE";
};

export type TextLimitStatus = "PASS" | "WARNING" | "ERROR";

export type TextLimitMetrics = {
  graphemeCountIncludingSpaces: number;
  koreanEquivalentUnits: number;
  maxKoreanEquivalentUnits: number;
  occupiedWidthPx: number;
  maxOccupiedWidthPx: number;
  widthRatio: number;
  inkBounds: BBox;
  rightExclusive: number;
  baselineY: number;
  textStartX: number;
  hardRightEdgeExclusive: number;
  limitStatus: TextLimitStatus;
};

export type NoneCtaInput = {
  mode: "NONE";
  landingType: "DIRECT_URL" | "ADVIEW" | "KAKAO_SERVICE";
  label?: null;
  iconPath?: null;
};

export type AppDownloadCtaInput = {
  mode: "APP_DOWNLOAD";
  landingType: "APP_STORE";
  label: string;
  iconPath: string;
};

export type KakaoServiceCtaInput = {
  mode: "KAKAO_SERVICE_ACTION";
  landingType: string;
  label: string;
  iconPath?: string | null;
};

export type CtaInput = NoneCtaInput | AppDownloadCtaInput | KakaoServiceCtaInput;

export type CanonicalCtaInput =
  | (Omit<NoneCtaInput, "label" | "iconPath"> & { label: null; iconPath: null })
  | (AppDownloadCtaInput & { label: string; iconPath: string })
  | (Omit<KakaoServiceCtaInput, "iconPath"> & { label: string; iconPath: string | null });

export type KakaoBizboardInputV1 = {
  schemaVersion: "1.2.0";
  channel: "KAKAO_MOMENT";
  placement: "BIZBOARD";
  template: "OBJECT_RIGHT";
  canvas?: {
    width: 1029;
    height: 258;
  };
  advertiser: {
    text: string;
    renderMode: "REQUIRE_IN_COPY";
  };
  copy: {
    headline: string;
    subcopy: string;
  };
  cta: CtaInput;
  assets: {
    product: {
      path: string;
      expectedSha256?: string | null;
      alphaTrim?: true;
    };
  };
  render?: {
    templateContractVersion?: "1.3.0" | "1.4.0" | "1.5.0" | "1.6.0" | "1.7.0" | "1.8.0" | "1.9.0";
    includeDebugOverlay?: false;
    pixelRatio?: 1;
  };
  output: {
    directory: string;
    baseName: string;
    overwrite?: boolean;
  };
};

export type CanonicalInput = Omit<KakaoBizboardInputV1, "canvas" | "render" | "cta" | "assets" | "output"> & {
  canvas: {
    width: 1029;
    height: 258;
  };
  cta: CanonicalCtaInput;
  assets: {
    product: {
      path: string;
      expectedSha256: string | null;
      alphaTrim: true;
    };
  };
  render: {
    templateContractVersion: "1.9.0";
    includeDebugOverlay: false;
    pixelRatio: 1;
  };
  output: {
    directory: string;
    baseName: string;
    overwrite: boolean;
  };
};

export type ProductAnalysis = {
  inputWidth: number;
  inputHeight: number;
  trimBox: BBox;
  sourceLayoutBox: BBox;
  ignoredNoiseComponents: number;
  scale: number;
  resizedWidth: number;
  resizedHeight: number;
  destinationX: number;
  destinationY: number;
  placedVisibleBox: BBox;
  resizedRgba: Buffer;
};

export type TextMeasurement = {
  text: string;
  advanceWidth: number;
  bbox: BBox;
  inkBounds: BBox;
  drawX: number;
  baselineY: number;
  metrics: TextLimitMetrics;
};

export type LayoutMeasurements = {
  headline: TextMeasurement;
  subcopy: TextMeasurement;
  headlineWidthPx: number;
  subcopyWidthPx: number;
  advertiserMatchedInCopy: boolean;
  advertiserMatchedField: "headline" | "subcopy" | null;
  copyObjectGapPx: number;
  objectOpaqueWidthPx: number;
  objectOpaqueHeightPx: number;
  objectScale: number;
  objectSlot: BBox;
  productPlacedBox: BBox;
  alphaTrimBox: BBox;
};

export type AssetDigest = {
  id: string;
  sha256: string;
};

export type RenderManifest = {
  schemaVersion: "1.0.0";
  canonicalInputDigest: string;
  normalizedInputDigest: string;
  outputPngDigest: string;
  /** F3A authoritative digest for either PNG or JPEG; outputPngDigest is retained for v1 compatibility. */
  outputArtifactDigest?: string;
  outputFileName?: string;
  outputEncoding?: {
    format: "PNG" | "JPEG";
    qualityRequested?: number | "AUTO_FIT";
    qualityResolved?: number;
    chromaSubsampling?: "4:2:0";
    progressive?: false;
    metadataStripped?: true;
  };
  templateContractVersion: "1.9.0";
  inputSchemaVersion: "1.2.0";
  outputSchemaVersion: "2.0.0";
  validatorResult: {
    errorCount: 0;
    warningCount: number;
    infoCount: number;
    issues: ValidationIssue[];
  };
  assetDigests: {
    product: AssetDigest;
    fonts: AssetDigest[];
    approvedIcons: AssetDigest[];
    referenceFixture: AssetDigest;
    images?: AssetDigest[];
    mask?: AssetDigest;
  };
  templateId?: string;
  formatProfileId?: string;
  appliedImagePlacements?: unknown[];
  appliedElements?: FreeformAppliedElement[];
  pixelFingerprint?: string;
  requestFingerprint?: string;
  renderFingerprint?: string;
  smartChannelReport?: SmartChannelReport;
  metaStaticReport?: {
    channel: "META";
    profileId: string;
    projectPixelPresetId: string | null;
    canvas: { width: number; height: number };
    officialRatio: string | null;
    placementContext: string | null;
    placementContextResolution: {
      requested: string | null;
      resolved: string | null;
      source: "EXPLICIT_REQUEST" | "DEFAULT_NONE";
      path: "/placementContext" | "/metaStatic/placementContext" | null;
    };
    safeZonePolicy: unknown;
    platformCopy: unknown;
    reelsGeometryStatus: "SOURCE_REQUIRED" | "NOT_APPLICABLE";
    manualAcceptanceStatus: "NOT_REVIEWED";
  };
  manualAcceptanceStatus: {
    status: "NOT_REVIEWED";
    items: Array<{
      id: string;
      status: "NOT_REVIEWED";
      reviewer: null;
      reviewedAt: null;
    }>;
  };
};

export type SmartChannelTextRoleReport = {
  role: "HEADLINE" | "SUBCOPY" | "DISCLOSURE" | "CTA_LABEL";
  inputKey: string;
  text: string;
  sourceLayer: string;
  typographyTokenId: string;
  box: BBox;
  expectedOrigin: { x: number; y: number };
  actualRasterBounds: BBox | null;
  baselineY: number;
  rasterBaselineY: number;
  measuredWidth: number;
  horizontalOverflowEvidence: {
    measuredWidth: number;
    actualRasterBounds: BBox | null;
    rightBoundary: number;
    actualRightEdge: number | null;
    decisionBasis: "ACTUAL_RASTER_BOUNDARY";
    overflow: boolean;
    clipped: boolean;
    diagnosticSurfaceClipped: boolean;
  };
  overflow: boolean;
};

export type SmartChannelReport = {
  templateId: string;
  objectPlacementToken: string;
  canvas: { width: number; height: number; format: "PNG"; colorType: "RGBA"; bitDepth: 8; hasAlpha: true };
  object: {
    placementToken: string;
    expectedRegion: BBox;
    actualRasterBounds: BBox | null;
    sourceRuleId: string;
    sourceMimeType: "image/png" | "image/jpeg";
    sourceDigest: string;
    frame: BBox;
    transform: "NONE" | "SOURCE_TRANSFORM";
    sourceCanvas: { width: number; height: number };
    alphaBounds: BBox | null;
    normalizedSize: { width: number; height: number; scale: number };
    finalBounds: BBox | null;
    targetRegion: BBox;
    opaquePixelCount: number;
    maxOpaquePixelCount: number;
  };
  textRoles: SmartChannelTextRoleReport[];
  fixedComponents: Array<{ id: string; digest: string; x: number; y: number; width: number; height: number }>;
  fonts: Array<{
    token: string;
    runtimePostScriptName: string;
    digest: string;
    collectionAssetId?: string;
    collectionDigest?: string;
    collectionFaceIndex?: number;
    collectionFacePostScriptName?: string;
    fontContractVersion?: string;
    integrationMode?: "VERIFIED_DERIVED_STANDALONE_FACE" | "LEGACY_N77_SINGLE_FONT";
  }>;
  artifact: { pngDigest: string; bytes: number };
};

export type RenderResponse = {
  schemaVersion: "1.0.0";
  manifestDigest: string | null;
  pngDigest: string | null;
  manifestPath: string | null;
  pngPath: string | null;
  downloadAllowed: boolean;
  status: "PASS" | "FAIL";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  formatProfileId?: string;
  templateId?: string;
  objectPlacementToken?: string;
  artifactChecksumSha256?: string;
  pixelFingerprint?: string;
  requestFingerprint?: string;
  renderFingerprint?: string;
  appliedElements?: FreeformAppliedElement[];
  artifactFormat?: "PNG" | "JPEG";
  artifactDigest?: string | null;
  artifactPath?: string | null;
  outputEncoding?: RenderManifest["outputEncoding"];
  metaStaticReport?: RenderManifest["metaStaticReport"];
};

/** @internal Desktop preview result. This is not part of the public JSON Input contract. */
export type InternalPreviewResult = {
  canonicalInputDigest: string | null;
  normalizedInputDigest: string | null;
  productAssetDigest: string | null;
  previewPngDigest: string | null;
  png: Buffer | null;
  pngMetadata: {
    format: "PNG";
    colorType: "RGBA";
    bitDepth: 8;
    hasAlpha: true;
    width: 1029;
    height: 258;
    bytes: number;
  } | null;
  measurements: LayoutMeasurements | null;
  validationStatus: "PASS" | "WARNING" | "ERROR";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type RendererConfig = {
  projectRoot: string;
  inputRoot: string;
  outputRoot: string;
};

export type ErrorRegistryEntry = {
  code: string;
  severity: Severity;
  messageKey: string;
  condition: string;
  behavior?: string;
};

export type FontAssetRegistry = {
  registryVersion: string;
  status: "RESOLVED_ASSET" | "UNRESOLVED_ASSET";
  requiredAssets: Array<{
    id: string;
    status: "RESOLVED_ASSET" | "UNRESOLVED_ASSET";
    relativePath: string | null;
    fileName: string | null;
    sha256: string | null;
    family?: string;
    fontVersion?: string;
    weight: number;
    style: string;
    usage: string[];
    licenseStatus: string;
  }>;
  renderingBlocker: boolean;
  fallbackAllowed: boolean;
};

export type CtaRegistry = {
  registryVersion: string;
  disabledModeErrorCode: string;
  modes: Array<{
    id: CtaInput["mode"];
    enabled: boolean;
    allowedLabels: Array<string | null>;
    allowedLandingTypes: string[];
    requiredAssetIds: string[];
    disabledReason: string | null;
  }>;
};

export type ReferenceFixtureRegistry = {
  templateContractVersion: "1.9.0";
  fixture: {
    id: string;
    path: string;
    sha256: string;
    png: {
      width: 1029;
      height: 258;
      colorType: "RGBA";
      bitDepth: 8;
    };
    objectSlot: BBox;
  };
};
