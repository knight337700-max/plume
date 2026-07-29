import { createHash } from "node:crypto";
import type {
  CompiledValidationRuleBundle,
  EffectiveValidationRule,
  RuleScope,
  ValidationRuleBundleInput,
  ValidationRuleDefinition,
  ValidationRuleSet,
} from "./rule-types.js";

const scopePriority: Readonly<Record<RuleScope, number>> = Object.freeze({
  GLOBAL: 0,
  CHANNEL: 1,
  PRODUCT: 2,
  FORMAT: 3,
  PLACEMENT: 4,
  INDUSTRY: 5,
  ADVERTISER: 6,
  SCHEDULED_REQUIREMENT: 7,
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function activation(rule: ValidationRuleDefinition, asOf: Date): "INFO" | "WARNING" | "ERROR" {
  const metadata = rule.metadata ?? {};
  const effectiveFrom = rule.effectiveFrom ?? String(metadata.effective_from ?? "");
  const warningFrom = rule.warningFrom ?? String(metadata.warning_from ?? "");
  if (!effectiveFrom && !warningFrom) return rule.severity === "SCHEDULED" ? "ERROR" : rule.severity;
  const effective = effectiveFrom ? new Date(effectiveFrom).getTime() : Number.POSITIVE_INFINITY;
  const warning = warningFrom ? new Date(warningFrom).getTime() : effective;
  const now = asOf.getTime();
  if (now >= effective) return "ERROR";
  if (now >= warning) return "WARNING";
  return "INFO";
}

function normalizeRule(
  rule: ValidationRuleDefinition,
  scope: RuleScope,
  sourceRuleSetId: string | undefined,
  set: ValidationRuleSet | undefined,
  asOf: Date,
): EffectiveValidationRule {
  const ruleScope = rule.scope ?? scope;
  const version = rule.version ?? set?.version ?? "1";
  const merged = {
    ...rule,
    ...(set?.effectiveFrom && !rule.effectiveFrom ? { effectiveFrom: set.effectiveFrom } : {}),
    ...(set?.warningFrom && !rule.warningFrom ? { warningFrom: set.warningFrom } : {}),
  };
  return {
    ...merged,
    version,
    scope: ruleScope,
    sourceScope: ruleScope,
    ...(sourceRuleSetId ? { sourceRuleSetId } : {}),
    activation: activation(merged, asOf),
  };
}

function flatten(
  input: ValidationRuleBundleInput,
  asOf: Date,
): readonly EffectiveValidationRule[] {
  const rules: EffectiveValidationRule[] = [];
  const add = (
    items: readonly ValidationRuleDefinition[] | undefined,
    scope: RuleScope,
    set?: ValidationRuleSet,
  ) => {
    for (const rule of items ?? []) rules.push(normalizeRule(rule, rule.scope ?? scope, set?.id, set, asOf));
  };
  add(input.globalRules, "GLOBAL");
  add(input.rules, "GLOBAL");
  for (const set of input.ruleSets ?? []) add(set.rules, set.scope ?? "GLOBAL", set);
  add(input.overrides, "ADVERTISER");
  return rules;
}

export function compileValidationRuleBundle(
  input: ValidationRuleBundleInput,
  options: { readonly asOf?: Date; readonly snapshotId?: string } = {},
): CompiledValidationRuleBundle {
  const asOf = options.asOf ?? new Date();
  const candidates = flatten(input, asOf);
  const selected = new Map<string, EffectiveValidationRule>();
  for (const rule of candidates) {
    const current = selected.get(rule.id);
    if (!current || scopePriority[rule.sourceScope] >= scopePriority[current.sourceScope])
      selected.set(rule.id, rule);
  }
  const rules = [...selected.values()].sort(
    (left, right) =>
      scopePriority[right.sourceScope] - scopePriority[left.sourceScope] ||
      left.id.localeCompare(right.id) ||
      left.version.localeCompare(right.version),
  );
  const snapshot = { sourceVersion: input.sourceVersion ?? "unknown", asOf: asOf.toISOString(), rules };
  const hash = createHash("sha256").update(JSON.stringify(canonicalize(snapshot))).digest("hex");
  return {
    snapshotId: options.snapshotId ?? input.snapshotId ?? `rules-${hash.slice(0, 16)}`,
    sourceVersion: input.sourceVersion ?? "unknown",
    asOf: asOf.toISOString(),
    rules: Object.freeze(rules),
    hash,
  };
}
