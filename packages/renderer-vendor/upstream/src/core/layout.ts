import { createCanvas } from "@napi-rs/canvas";

import type { ContractBundle } from "./contracts.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COPY_OBJECT_MINIMUM_GAP,
  FONT_ALIAS_BOLD,
  FONT_ALIAS_REGULAR,
  HEADLINE_BASELINE_Y,
  MINIMUM_COPY_WIDTH,
  OBJECT_SLOT,
  SUBCOPY_BASELINE_Y,
  TEXT_DRAW_X,
} from "./constants.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import {
  createTextLimitMetrics,
  hasConsecutiveSpaces,
  textMaximumUnits,
  textWidthStatus,
  type TextField,
} from "./text-contract.js";
import type {
  BBox,
  CanonicalInput,
  LayoutMeasurements,
  ProductAnalysis,
  TextMeasurement,
  ValidationIssue,
} from "./types.js";

function scanCanvasAlpha(data: Uint8ClampedArray, width: number, height: number): BBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function measureText(
  field: TextField,
  text: string,
  fontSize: number,
  fontAlias: string,
  color: string,
  baselineY: number,
): TextMeasurement {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const context = canvas.getContext("2d");
  context.textBaseline = "alphabetic";
  context.font = `${fontSize}px "${fontAlias}"`;
  const advanceWidth = context.measureText(text).width;
  context.fillStyle = color;
  context.fillText(text, TEXT_DRAW_X, baselineY);
  const imageData = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const bbox = scanCanvasAlpha(imageData.data, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (!bbox) throw new Error("Text produced no visible pixels");
  return {
    text,
    advanceWidth,
    bbox,
    inkBounds: bbox,
    drawX: TEXT_DRAW_X,
    baselineY,
    metrics: createTextLimitMetrics(field, text, bbox, baselineY),
  };
}

function intersects(left: BBox, right: BBox): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function calculateLayout(
  input: CanonicalInput,
  product: ProductAnalysis,
  contracts: ContractBundle,
): { measurements: LayoutMeasurements; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const headline = measureText(
    "headline",
    input.copy.headline,
    48,
    FONT_ALIAS_BOLD,
    "#4C4C4C",
    HEADLINE_BASELINE_Y,
  );
  const subcopy = measureText(
    "subcopy",
    input.copy.subcopy,
    39,
    FONT_ALIAS_REGULAR,
    "#777777",
    SUBCOPY_BASELINE_Y,
  );

  for (const [field, measurement, pointer] of [
    ["headline", headline, "/copy/headline"],
    ["subcopy", subcopy, "/copy/subcopy"],
  ] as const) {
    const maximumUnits = textMaximumUnits(field);
    if (measurement.metrics.koreanEquivalentUnits > maximumUnits) {
      issues.push(
        createIssue(
          contracts.errorRegistry,
          field === "headline" ? "KBR-TEXT-COUNT-HEADLINE-001" : "KBR-TEXT-COUNT-SUBCOPY-001",
          pointer,
          {
            actual: {
              actual: measurement.metrics.koreanEquivalentUnits,
              limit: maximumUnits,
              unit: "KOREAN_EQUIVALENT_CHARACTER",
            },
          },
        ),
      );
    }
    const widthStatus = textWidthStatus(
      measurement.metrics.occupiedWidthPx,
      measurement.metrics.rightExclusive,
    );
    if (widthStatus === "ERROR") {
      issues.push(
        createIssue(
          contracts.errorRegistry,
          field === "headline" ? "KBR-TEXT-004" : "KBR-TEXT-005",
          pointer,
          {
            expected: {
              limitWidthPx: measurement.metrics.maxOccupiedWidthPx,
              hardRightEdgeExclusive: measurement.metrics.hardRightEdgeExclusive,
            },
            actual: {
              actualWidthPx: measurement.metrics.occupiedWidthPx,
              limitWidthPx: measurement.metrics.maxOccupiedWidthPx,
              overflowPx: Math.max(0, measurement.metrics.occupiedWidthPx - measurement.metrics.maxOccupiedWidthPx),
              rightExclusive: measurement.metrics.rightExclusive,
              hardRightEdgeExclusive: measurement.metrics.hardRightEdgeExclusive,
            },
            bbox: measurement.inkBounds,
          },
        ),
      );
    } else if (widthStatus === "WARNING") {
      issues.push(
        createIssue(
          contracts.errorRegistry,
          field === "headline" ? "KBR-TEXT-WIDTH-HEADLINE-W001" : "KBR-TEXT-WIDTH-SUBCOPY-W001",
          pointer,
          {
            expected: { warningThresholdPx: 527, maximumWidthPx: measurement.metrics.maxOccupiedWidthPx },
            actual: {
              actualWidthPx: measurement.metrics.occupiedWidthPx,
              limitWidthPx: measurement.metrics.maxOccupiedWidthPx,
              rightExclusive: measurement.metrics.rightExclusive,
            },
            bbox: measurement.inkBounds,
          },
        ),
      );
    }
    const value = field === "headline" ? input.copy.headline : input.copy.subcopy;
    if (hasConsecutiveSpaces(value)) {
      issues.push(
        createIssue(contracts.errorRegistry, "KBR-TEXT-SPACING-001", pointer, {
          actual: { consecutiveSpaces: true },
        }),
      );
    }
  }

  if (headline.metrics.occupiedWidthPx < MINIMUM_COPY_WIDTH && subcopy.metrics.occupiedWidthPx < MINIMUM_COPY_WIDTH) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-TEXT-006", "/copy", {
        expected: { atLeastOneWidth: MINIMUM_COPY_WIDTH },
        actual: {
          headlineWidth: headline.metrics.occupiedWidthPx,
          subcopyWidth: subcopy.metrics.occupiedWidthPx,
        },
      }),
    );
  }
  if (intersects(headline.bbox, subcopy.bbox)) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-LAYOUT-004", "/copy"));
  }

  const copyRight = Math.max(headline.bbox.x + headline.bbox.width, subcopy.bbox.x + subcopy.bbox.width);
  const copyObjectGapPx = product.placedVisibleBox.x - copyRight;
  if (copyObjectGapPx < COPY_OBJECT_MINIMUM_GAP) {
    issues.push(
      createIssue(contracts.errorRegistry, "KBR-LAYOUT-001", "/copy", {
        expected: { minimumGap: COPY_OBJECT_MINIMUM_GAP },
        actual: { gap: copyObjectGapPx },
      }),
    );
  }

  for (const [pointer, box] of [
    ["/copy/headline", headline.bbox],
    ["/copy/subcopy", subcopy.bbox],
    ["/assets/product/path", product.placedVisibleBox],
  ] as const) {
    if (box.x < 0 || box.y < 0 || box.x + box.width > CANVAS_WIDTH || box.y + box.height > CANVAS_HEIGHT) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-LAYOUT-007", pointer, { bbox: box }));
    }
  }

  const advertiser = input.advertiser.text.toLocaleLowerCase("ko-KR");
  const inHeadline = input.copy.headline.toLocaleLowerCase("ko-KR").includes(advertiser);
  const inSubcopy = input.copy.subcopy.toLocaleLowerCase("ko-KR").includes(advertiser);
  const advertiserMatchedField = inHeadline ? "headline" : inSubcopy ? "subcopy" : null;

  return {
    measurements: {
      headline,
      subcopy,
      headlineWidthPx: headline.metrics.occupiedWidthPx,
      subcopyWidthPx: subcopy.metrics.occupiedWidthPx,
      advertiserMatchedInCopy: inHeadline || inSubcopy,
      advertiserMatchedField,
      copyObjectGapPx,
      objectOpaqueWidthPx: product.placedVisibleBox.width,
      objectOpaqueHeightPx: product.placedVisibleBox.height,
      objectScale: product.scale,
      objectSlot: { ...OBJECT_SLOT },
      productPlacedBox: product.placedVisibleBox,
      alphaTrimBox: product.trimBox,
    },
    issues: sortAndDedupeIssues(issues),
  };
}
