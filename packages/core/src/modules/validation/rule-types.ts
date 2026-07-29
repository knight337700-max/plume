export type RuleScope =
  | "GLOBAL"
  | "CHANNEL"
  | "PRODUCT"
  | "FORMAT"
  | "PLACEMENT"
  | "INDUSTRY"
  | "ADVERTISER"
  | "SCHEDULED_REQUIREMENT";
export type RuleSeverity = "INFO" | "WARNING" | "ERROR" | "SCHEDULED";
export type RuleActivation = "INFO" | "WARNING" | "ERROR";

export interface ValidationRuleDefinition {
  readonly id: string;
  readonly version?: string;
  readonly scope?: RuleScope;
  readonly target: string;
  readonly operator: string;
  readonly value?: unknown;
  readonly severity: RuleSeverity;
  readonly autoFix?: string;
  readonly message: string;
  readonly effectiveFrom?: string;
  readonly warningFrom?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ValidationRuleSet {
  readonly id: string;
  readonly version?: string;
  readonly scope?: RuleScope;
  readonly effectiveFrom?: string;
  readonly warningFrom?: string;
  readonly rules?: readonly ValidationRuleDefinition[];
  readonly inherits?: readonly string[];
}

export interface ValidationRuleBundleInput {
  readonly rules?: readonly ValidationRuleDefinition[];
  readonly globalRules?: readonly ValidationRuleDefinition[];
  readonly ruleSets?: readonly ValidationRuleSet[];
  readonly overrides?: readonly ValidationRuleDefinition[];
  readonly snapshotId?: string;
  readonly sourceVersion?: string;
  readonly [key: string]: unknown;
}

export interface EffectiveValidationRule extends ValidationRuleDefinition {
  readonly version: string;
  readonly scope: RuleScope;
  readonly activation: RuleActivation;
  readonly sourceScope: RuleScope;
  readonly sourceRuleSetId?: string;
}

export interface CompiledValidationRuleBundle {
  readonly snapshotId: string;
  readonly sourceVersion: string;
  readonly asOf: string;
  readonly rules: readonly EffectiveValidationRule[];
  readonly hash: string;
}
