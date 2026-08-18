import {
  HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS,
  MAXIMUM_OCCUPIED_WIDTH_PX,
  SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS,
  TEXT_CONTRACT,
  TEXT_DRAW_X,
  TEXT_HARD_RIGHT_EDGE,
  TEXT_WIDTH_WARNING_THRESHOLD_PX,
} from "./constants.js";
import type { BBox, TextLimitMetrics, TextLimitStatus } from "./types.js";

export type TextField = "headline" | "subcopy";

const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

function firstCodePoint(grapheme: string): number {
  return grapheme.codePointAt(0) ?? 0;
}

function isCjkOrKana(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

function isEmojiGrapheme(grapheme: string): boolean {
  return /\p{Extended_Pictographic}/u.test(grapheme) || /\p{Emoji_Presentation}/u.test(grapheme);
}

function isLatinGrapheme(grapheme: string): boolean {
  return /\p{Script=Latin}/u.test(grapheme);
}

function graphemeUnit(grapheme: string): number {
  if (grapheme === " ") return 0;
  const codePoint = firstCodePoint(grapheme);
  if (codePoint <= 0x7f) return 0.5;
  if (isCjkOrKana(codePoint) || isEmojiGrapheme(grapheme)) return 1;
  if (isLatinGrapheme(grapheme)) return 0.5;
  return 1;
}

export function segmentGraphemes(value: string): string[] {
  const normalized = value.normalize("NFC");
  return Array.from(graphemeSegmenter.segment(normalized), ({ segment }) => segment);
}

export function koreanEquivalentUnits(value: string): number {
  const units = segmentGraphemes(value).reduce((sum, grapheme) => sum + graphemeUnit(grapheme), 0);
  return Number(units.toFixed(1));
}

export function graphemeCountIncludingSpaces(value: string): number {
  return segmentGraphemes(value).length;
}

export function hasConsecutiveSpaces(value: string): boolean {
  return / {2,}/u.test(value.normalize("NFC").trim());
}

export function textMaximumUnits(field: TextField): number {
  return field === "headline" ? HEADLINE_MAX_KOREAN_EQUIVALENT_UNITS : SUBCOPY_MAX_KOREAN_EQUIVALENT_UNITS;
}

export function textWidthStatus(occupiedWidthPx: number, rightExclusive: number): TextLimitStatus {
  if (occupiedWidthPx > MAXIMUM_OCCUPIED_WIDTH_PX || rightExclusive > TEXT_HARD_RIGHT_EDGE) return "ERROR";
  if (occupiedWidthPx >= TEXT_WIDTH_WARNING_THRESHOLD_PX) return "WARNING";
  return "PASS";
}

export function createTextLimitMetrics(
  field: TextField,
  value: string,
  inkBounds: BBox,
  baselineY: number,
): TextLimitMetrics {
  const rightExclusive = inkBounds.x + inkBounds.width;
  const occupiedWidthPx = Math.max(0, rightExclusive - TEXT_DRAW_X);
  const maxKoreanEquivalentUnits = textMaximumUnits(field);
  const units = koreanEquivalentUnits(value);
  const widthStatus = textWidthStatus(occupiedWidthPx, rightExclusive);
  const unitStatus: TextLimitStatus = units > maxKoreanEquivalentUnits ? "ERROR" : "PASS";
  const limitStatus: TextLimitStatus = unitStatus === "ERROR" || widthStatus === "ERROR"
    ? "ERROR"
    : widthStatus === "WARNING"
      ? "WARNING"
      : "PASS";
  return {
    graphemeCountIncludingSpaces: graphemeCountIncludingSpaces(value),
    koreanEquivalentUnits: units,
    maxKoreanEquivalentUnits,
    occupiedWidthPx,
    maxOccupiedWidthPx: MAXIMUM_OCCUPIED_WIDTH_PX,
    widthRatio: occupiedWidthPx / MAXIMUM_OCCUPIED_WIDTH_PX,
    inkBounds,
    rightExclusive,
    baselineY,
    textStartX: TEXT_DRAW_X,
    hardRightEdgeExclusive: TEXT_HARD_RIGHT_EDGE,
    limitStatus,
  };
}

export { TEXT_CONTRACT };
