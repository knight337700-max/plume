import type { BBox } from "./types.js";

export const CANVAS_WIDTH = 1029;
export const CANVAS_HEIGHT = 258;
export const TEMPLATE_CONTRACT_VERSION = "1.9.0" as const;
export const INPUT_SCHEMA_VERSION = "1.2.0" as const;
export const OUTPUT_SCHEMA_VERSION = "2.0.0" as const;
export const MANIFEST_SCHEMA_VERSION = "1.0.0" as const;
export const RESPONSE_SCHEMA_VERSION = "1.0.0" as const;

export const OBJECT_SLOT: Readonly<BBox> = Object.freeze({
  x: 666,
  y: 0,
  width: 315,
  height: 258,
});

export const TEXT_DRAW_X = 48;
export const TEXT_HARD_RIGHT_EDGE = 633;
export const HEADLINE_BASELINE_Y = 120;
export const SUBCOPY_BASELINE_Y = 178;
export const MAXIMUM_OCCUPIED_WIDTH_PX = TEXT_HARD_RIGHT_EDGE - TEXT_DRAW_X;
export const TEXT_WIDTH_WARNING_THRESHOLD_PX = 527;
export const HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS = 12;
export const SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS = 15;
export const COPY_OBJECT_MINIMUM_GAP = 33;
export const MINIMUM_COPY_WIDTH = 290;
export const RECOMMENDED_OBJECT_WIDTH = 219;

export const TRIM_PRESERVE_THRESHOLD = 1;
export const LAYOUT_VISIBLE_THRESHOLD = 8;
export const ALPHA_SOLID_THRESHOLD = 245;
export const ISOLATED_COMPONENT_RATIO = 0.0005;
export const MAX_UPSCALE = 1.5;

export const WARNING_THRESHOLD_BYTES = 270_000;
export const HARD_LIMIT_BYTES = 300_000;

export const OUTPUT_PNG_FILE_NAME = "output.png";
export const RENDER_MANIFEST_FILE_NAME = "render-manifest.json";
export const STAGING_DIRECTORY_NAME = ".out-staging";

export const FONT_ALIAS_BOLD = "KBR Spoqa Han Sans Bold";
export const FONT_ALIAS_REGULAR = "KBR Spoqa Han Sans Regular";

export const TEXT_CONTRACT = Object.freeze({
  headlineBaselineY: HEADLINE_BASELINE_Y,
  subcopyBaselineY: SUBCOPY_BASELINE_Y,
  textStartX: TEXT_DRAW_X,
  hardRightEdgeExclusive: TEXT_HARD_RIGHT_EDGE,
  maximumOccupiedWidthPx: MAXIMUM_OCCUPIED_WIDTH_PX,
  headlineMaxKoreanUnits: HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS,
  subcopyMaxKoreanUnits: SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS,
  warningWidthThresholdPx: TEXT_WIDTH_WARNING_THRESHOLD_PX,
  headlineFontSizePx: 48,
  subcopyFontSizePx: 39,
  headlineFontWeight: 700,
  subcopyFontWeight: 400,
} as const);
