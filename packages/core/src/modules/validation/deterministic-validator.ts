import { parseCreativeDocument, type CreativeDocument, type CreativeElement } from "../creative/creative-document.js";
import type { EffectiveValidationRule, RuleActivation, ValidationRuleDefinition } from "./rule-types.js";
import {
  elementMatches,
  type DeterministicRuleContext,
  type RuleEvaluation,
  type ValidationFileMetadata,
  textElements,
  visibleElements,
} from "./rules/index.js";

export type { ValidationFileMetadata } from "./rules/index.js";

export interface DeterministicValidationInput extends DeterministicRuleContext {
  readonly rules?: readonly (EffectiveValidationRule | ValidationRuleDefinition)[];
  readonly ruleBundle?: { readonly rules: readonly (EffectiveValidationRule | ValidationRuleDefinition)[] };
}

export interface ValidationFinding {
  readonly ruleCode: string;
  readonly ruleId: string;
  readonly severity: RuleActivation;
  readonly message: string;
  readonly resultType: "DETERMINISTIC";
  readonly targetType: string;
  readonly targetElementIds: readonly string[];
  readonly expectedValue?: unknown;
  readonly actualValue?: unknown;
  readonly sourceRuleVersion: string;
  readonly suggestedFix?: unknown;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface DeterministicValidationResult {
  readonly status: "PASS" | "WARNING" | "ERROR";
  readonly findings: readonly ValidationFinding[];
  readonly summary: { readonly errorCount: number; readonly warningCount: number; readonly infoCount: number };
}

function valueRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : {};
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function expectedDimension(rule: ValidationRuleDefinition, context: DeterministicRuleContext): { width?: number; height?: number } {
  const value = valueRecord(rule.value);
  const profile = valueRecord(context.formatProfile);
  const spec = valueRecord(profile.spec);
  return {
    width: numeric(value.width ?? spec.width ?? profile.width),
    height: numeric(value.height ?? spec.height ?? profile.height),
  };
}

function textValue(element: CreativeElement): string {
  return element.text ?? "";
}

function lineCount(value: string): number {
  return value.length === 0 ? 0 : value.split(/\r?\n/).length;
}

function selectedElements(document: CreativeDocument, rule: ValidationRuleDefinition): readonly CreativeElement[] {
  const value = valueRecord(rule.value);
  const target = value.target ?? rule.target;
  return visibleElements(document).filter((element) => elementMatches(element, target));
}

function evaluateRule(rule: ValidationRuleDefinition, context: DeterministicRuleContext): RuleEvaluation {
  const document = context.creativeDocument;
  const file: ValidationFileMetadata = context.file ?? {};
  const value = rule.value;
  const record = valueRecord(value);
  const elements = selectedElements(document, rule);
  const texts = textElements(document);
  const allIds = elements.map((element) => element.id);
  const dimension = { width: document.canvas.width, height: document.canvas.height };
  switch (rule.operator) {
    case "DIMENSION_EQ": {
      const expected = { width: numeric(record.width), height: numeric(record.height) };
      return { passed: dimension.width === expected.width && dimension.height === expected.height, actualValue: dimension, targetElementIds: [], targetType: rule.target, details: { expected } };
    }
    case "DIMENSION_EQ_PROFILE": {
      const expected = expectedDimension(rule, context);
      return { passed: dimension.width === expected.width && dimension.height === expected.height, actualValue: dimension, targetElementIds: [], targetType: rule.target, details: { expected } };
    }
    case "BYTES_LTE": {
      const actual = file.bytes ?? Number.NaN;
      return { passed: Number.isFinite(actual) && actual <= Number(value), actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    case "BETWEEN_BYTES": {
      const expected = valueRecord(value);
      const actual = file.bytes ?? Number.NaN;
      return { passed: Number.isFinite(actual) && actual >= Number(expected.min) && actual <= Number(expected.max), actualValue: actual, targetElementIds: [], targetType: rule.target, details: { expected } };
    }
    case "MIME_IN": {
      const allowed = Array.isArray(value) ? value.map(String) : [];
      const actual = file.magicMimeType ?? file.mimeType ?? null;
      return { passed: typeof actual === "string" && allowed.includes(actual), actualValue: actual, targetElementIds: [], targetType: rule.target, details: { allowed } };
    }
    case "MIME_NOT_PREFIX": {
      const actual = file.magicMimeType ?? file.mimeType ?? null;
      return { passed: typeof actual === "string" && !actual.startsWith(String(value)), actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    case "ALPHA_CHANNEL_EQ": {
      const actual = file.alpha ?? document.canvas.transparentBackground;
      return { passed: actual === Boolean(value), actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    case "COLOR_MODE_EQ": {
      const actual = file.colorMode ?? document.canvas.colorMode;
      return { passed: actual === String(value), actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    case "CHAR_COUNT_LTE": {
      const limit = Number(value);
      const actual = Math.max(0, ...elements.map((element) => [...textValue(element)].length));
      return { passed: actual <= limit, actualValue: actual, targetElementIds: allIds, targetType: rule.target, details: { limit } };
    }
    case "TOTAL_LINES_LTE": {
      const limit = Number(value);
      const actual = texts.reduce((sum, element) => sum + lineCount(textValue(element)), 0);
      return { passed: actual <= limit, actualValue: actual, targetElementIds: texts.map((element) => element.id), targetType: rule.target, details: { limit } };
    }
    case "CONDITIONAL_TOTAL_LINES_LTE": {
      const config = valueRecord(value);
      const limit = Number(config.default ?? config.when_extra_info_used ?? 0);
      const actual = texts.reduce((sum, element) => sum + lineCount(textValue(element)), 0);
      return { passed: actual <= limit, actualValue: actual, targetElementIds: texts.map((element) => element.id), targetType: rule.target, details: { limit } };
    }
    case "ANY_CHAR_COUNT_LTE": {
      const limit = Number(value);
      const actual = texts.map((element) => [...textValue(element)].length);
      return { passed: actual.some((count) => count <= limit), actualValue: actual, targetElementIds: texts.map((element) => element.id), targetType: rule.target, details: { limit } };
    }
    case "TEXT_AREA_RATIO_LTE": {
      const total = document.canvas.width * document.canvas.height;
      const textArea = texts.reduce((sum, element) => sum + element.width * element.height, 0);
      const actual = total > 0 ? textArea / total : 1;
      return { passed: actual <= Number(value), actualValue: actual, targetElementIds: texts.map((element) => element.id), targetType: rule.target };
    }
    case "COUNT_BETWEEN":
    case "COUNT_BETWEEN_ELEMENTS": {
      const config = valueRecord(value);
      const actual = Array.isArray(value) ? value.length : elements.length;
      return { passed: actual >= Number(config.min) && actual <= Number(config.max), actualValue: actual, targetElementIds: allIds, targetType: rule.target, details: { expected: config } };
    }
    case "SLOTS_MIN_COUNT":
    case "SLOT_MIN_COUNT": {
      const slots = file.slots ?? {};
      const expected = rule.operator === "SLOT_MIN_COUNT" ? { [String(record.slot)]: Number(record.count) } : record;
      const failures = Object.entries(expected).filter(([slot, count]) => Number(slots[slot] ?? 0) < Number(count));
      return { passed: failures.length === 0, actualValue: slots, targetElementIds: [], targetType: rule.target, details: { expected, failures } };
    }
    case "ELEMENT_EXISTS": {
      const required = String(value);
      const matching = visibleElements(document).filter((element) => elementMatches(element, required));
      return { passed: matching.length > 0, actualValue: matching.length, targetElementIds: matching.map((element) => element.id), targetType: rule.target, details: { required } };
    }
    case "INSIDE_MARGIN": {
      const margin = valueRecord(value);
      const failures = elements.filter((element) => element.x < Number(margin.left ?? 0) || element.y < Number(margin.top ?? 0) || element.x + element.width > document.canvas.width - Number(margin.right ?? 0) || element.y + element.height > document.canvas.height - Number(margin.bottom ?? 0));
      return { passed: failures.length === 0, actualValue: failures.map((element) => element.id), targetElementIds: failures.map((element) => element.id), targetType: rule.target, details: { margin } };
    }
    case "BOUNDING_BOX_LTE": {
      const expected = valueRecord(value);
      const failures = elements.filter((element) => element.width > Number(expected.width) || element.height > Number(expected.height));
      return { passed: failures.length === 0, actualValue: failures.map((element) => ({ id: element.id, width: element.width, height: element.height })), targetElementIds: failures.map((element) => element.id), targetType: rule.target, details: { expected } };
    }
    case "FIELD_EXISTS": {
      const key = String(value);
      const actual = context.metadata?.[key] ?? context.exportRecipe?.[key] ?? context.formatProfile?.[key];
      return { passed: actual !== undefined && actual !== null && actual !== "", actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    case "PROMOTIONAL_OVERLAY_EQ":
    case "TEXT_OVERLAY_EQ": {
      const actual = texts.length > 0;
      return { passed: actual === Boolean(value), actualValue: actual, targetElementIds: texts.map((element) => element.id), targetType: rule.target };
    }
    case "ANIMATED_EQ": {
      const actual = Boolean(file.metadata?.animated);
      return { passed: actual === Boolean(value), actualValue: actual, targetElementIds: [], targetType: rule.target };
    }
    default:
      return { passed: false, actualValue: undefined, targetElementIds: allIds, targetType: rule.target, details: { unsupportedOperator: rule.operator } };
  }
}

function severityRank(severity: RuleActivation): number {
  return severity === "ERROR" ? 3 : severity === "WARNING" ? 2 : 1;
}

export function runDeterministicValidation(input: DeterministicValidationInput): DeterministicValidationResult {
  const creativeDocument = parseCreativeDocument(input.creativeDocument);
  const rules = input.rules ?? input.ruleBundle?.rules ?? [];
  const context = { ...input, creativeDocument };
  const findings: ValidationFinding[] = [];
  for (const rule of rules) {
    const evaluation = evaluateRule(rule, context);
    if (evaluation.passed) continue;
    const severity =
      ("activation" in rule ? rule.activation : undefined) ??
      (rule.severity === "SCHEDULED" ? "INFO" : rule.severity);
    const finding: ValidationFinding = {
      ruleCode: rule.id,
      ruleId: rule.id,
      severity,
      message: rule.message,
      resultType: "DETERMINISTIC",
      targetType: evaluation.targetType,
      targetElementIds: evaluation.targetElementIds,
      ...(rule.value !== undefined ? { expectedValue: rule.value } : {}),
      ...(evaluation.actualValue !== undefined ? { actualValue: evaluation.actualValue } : {}),
      sourceRuleVersion: rule.version ?? "1",
      ...(rule.autoFix ? { suggestedFix: { autoFix: rule.autoFix } } : {}),
      details: { ...(evaluation.details ?? {}), operator: rule.operator },
    };
    findings.push(finding);
  }
  const summary = {
    errorCount: findings.filter((finding) => finding.severity === "ERROR").length,
    warningCount: findings.filter((finding) => finding.severity === "WARNING").length,
    infoCount: findings.filter((finding) => finding.severity === "INFO").length,
  };
  const status = summary.errorCount > 0 ? "ERROR" : summary.warningCount > 0 ? "WARNING" : "PASS";
  return { status, findings: Object.freeze(findings), summary };
}

export const validateDeterministically = runDeterministicValidation;
