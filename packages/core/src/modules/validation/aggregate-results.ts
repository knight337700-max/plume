import type { ValidationFinding } from "./deterministic-validator.js";
import type { RuleActivation } from "./rule-types.js";

export interface AiValidationFinding {
  readonly ruleCode: string;
  readonly severity: RuleActivation;
  readonly confidence: number;
  readonly message: string;
  readonly targetElementIds: readonly string[];
  readonly evidence?: readonly string[];
  readonly suggestedFix?: unknown;
  readonly sourceRuleVersion?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AggregatedValidationFinding {
  readonly ruleCode: string;
  readonly severity: RuleActivation;
  readonly message: string;
  readonly resultType: "DETERMINISTIC" | "AI_ASSISTED";
  readonly targetType: string;
  readonly targetElementIds: readonly string[];
  readonly sourceRuleVersion: string;
  readonly confidence?: number;
  readonly evidence: readonly string[];
  readonly suggestedFix?: unknown;
  readonly details: Readonly<Record<string, unknown>>;
  readonly stableKey: string;
}

export interface AggregatedValidationResult {
  readonly status: "PASS" | "WARNING" | "ERROR";
  readonly findings: readonly AggregatedValidationFinding[];
  readonly summary: { readonly errorCount: number; readonly warningCount: number; readonly infoCount: number };
}

export interface AggregationOptions {
  readonly confidenceErrorThreshold?: number;
  readonly confidenceThresholds?: Readonly<Record<string, number>>;
}

function rank(severity: RuleActivation): number {
  return severity === "ERROR" ? 3 : severity === "WARNING" ? 2 : 1;
}

function stableKey(ruleCode: string, targetElementIds: readonly string[]): string {
  return `${ruleCode}:${[...targetElementIds].sort().join(",")}`;
}

function merge(
  current: AggregatedValidationFinding,
  next: AggregatedValidationFinding,
): AggregatedValidationFinding {
  const stronger = rank(next.severity) > rank(current.severity) ? next : current;
  return {
    ...stronger,
    resultType: current.resultType === "DETERMINISTIC" || next.resultType === "DETERMINISTIC" ? "DETERMINISTIC" : "AI_ASSISTED",
    targetElementIds: [...new Set([...current.targetElementIds, ...next.targetElementIds])].sort(),
    evidence: [...new Set([...current.evidence, ...next.evidence])].sort(),
    ...(current.confidence !== undefined || next.confidence !== undefined
      ? { confidence: Math.max(current.confidence ?? 0, next.confidence ?? 0) }
      : {}),
    details: { ...current.details, ...next.details },
  };
}

function fromDeterministic(finding: ValidationFinding): AggregatedValidationFinding {
  return {
    ruleCode: finding.ruleCode,
    severity: finding.severity,
    message: finding.message,
    resultType: "DETERMINISTIC",
    targetType: finding.targetType,
    targetElementIds: [...finding.targetElementIds].sort(),
    sourceRuleVersion: finding.sourceRuleVersion,
    evidence: [],
    ...(finding.suggestedFix !== undefined ? { suggestedFix: finding.suggestedFix } : {}),
    details: finding.details,
    stableKey: stableKey(finding.ruleCode, finding.targetElementIds),
  };
}

function fromAi(finding: AiValidationFinding, options: AggregationOptions): AggregatedValidationFinding {
  const threshold = options.confidenceThresholds?.[finding.ruleCode] ?? options.confidenceErrorThreshold ?? 0.9;
  const severity = finding.severity === "ERROR" && finding.confidence < threshold ? "WARNING" : finding.severity;
  return {
    ruleCode: finding.ruleCode,
    severity,
    message: finding.message,
    resultType: "AI_ASSISTED",
    targetType: "AI",
    targetElementIds: [...finding.targetElementIds].sort(),
    sourceRuleVersion: finding.sourceRuleVersion ?? "1",
    confidence: finding.confidence,
    evidence: [...(finding.evidence ?? [])].sort(),
    ...(finding.suggestedFix !== undefined ? { suggestedFix: finding.suggestedFix } : {}),
    details: { ...(finding.details ?? {}), ...(severity !== finding.severity ? { normalizedFrom: finding.severity, confidenceThreshold: threshold } : {}) },
    stableKey: stableKey(finding.ruleCode, finding.targetElementIds),
  };
}

export function aggregateValidationFindings(
  deterministic: readonly ValidationFinding[],
  ai: readonly AiValidationFinding[] = [],
  options: AggregationOptions = {},
): AggregatedValidationResult {
  const merged = new Map<string, AggregatedValidationFinding>();
  for (const finding of deterministic.map(fromDeterministic)) {
    const current = merged.get(finding.stableKey);
    merged.set(finding.stableKey, current ? merge(current, finding) : finding);
  }
  for (const finding of ai.map((item) => fromAi(item, options))) {
    const current = merged.get(finding.stableKey);
    merged.set(finding.stableKey, current ? merge(current, finding) : finding);
  }
  const findings = [...merged.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  const summary = {
    errorCount: findings.filter((finding) => finding.severity === "ERROR").length,
    warningCount: findings.filter((finding) => finding.severity === "WARNING").length,
    infoCount: findings.filter((finding) => finding.severity === "INFO").length,
  };
  return {
    status: summary.errorCount > 0 ? "ERROR" : summary.warningCount > 0 ? "WARNING" : "PASS",
    findings: Object.freeze(findings),
    summary,
  };
}

export const aggregateValidationResults = aggregateValidationFindings;
