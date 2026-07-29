import type { CreativeDocument, CreativeElement } from "../../creative/creative-document.js";
import type { EffectiveValidationRule, RuleActivation, ValidationRuleDefinition } from "../rule-types.js";

export interface ValidationFileMetadata {
  readonly mimeType?: string | null;
  readonly magicMimeType?: string | null;
  readonly bytes?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly alpha?: boolean | null;
  readonly colorMode?: string | null;
  readonly slots?: Readonly<Record<string, number>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DeterministicRuleContext {
  readonly creativeDocument: CreativeDocument;
  readonly file?: ValidationFileMetadata;
  readonly formatProfile?: Readonly<Record<string, unknown>>;
  readonly exportRecipe?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RuleEvaluation {
  readonly passed: boolean;
  readonly actualValue?: unknown;
  readonly targetElementIds: readonly string[];
  readonly targetType: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function ruleSeverity(rule: EffectiveValidationRule | ValidationRuleDefinition): RuleActivation {
  if (rule.severity === "SCHEDULED") return "ERROR";
  return rule.severity;
}

export function visibleElements(document: CreativeDocument): readonly CreativeElement[] {
  return document.elements.filter((element) => element.visible);
}

export function textElements(document: CreativeDocument): readonly CreativeElement[] {
  return visibleElements(document).filter(
    (element) => element.type === "TEXT" || element.type === "CTA" || Boolean(element.text),
  );
}

export function elementMatches(element: CreativeElement, target: unknown): boolean {
  if (typeof target !== "string") return true;
  const metadata = element.metadata ?? {};
  return [element.type, element.name, element.textSlotCode, metadata.role, metadata.targetType]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value === target || value.toUpperCase() === target.toUpperCase());
}
