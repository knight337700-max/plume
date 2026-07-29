import type { CreativeDocument } from "../../../../../packages/core/src/modules/creative/creative-document.js";
import { aggregateValidationFindings, type AiValidationFinding } from "../../../../../packages/core/src/modules/validation/aggregate-results.js";
import { runDeterministicValidation, type ValidationFileMetadata } from "../../../../../packages/core/src/modules/validation/deterministic-validator.js";
import type { ValidationRepositories, ValidationRunRecord } from "../../../../../packages/core/src/modules/validation/repositories.js";
import { compileValidationRuleBundle } from "../../../../../packages/core/src/modules/validation/rule-compiler.js";
import type { ValidationRuleBundleInput } from "../../../../../packages/core/src/modules/validation/rule-types.js";

export interface ValidationWorkerInput {
  readonly workspaceId: string;
  readonly validationRunId?: string;
  readonly creativeVersionId: string;
  readonly creativeDocument: CreativeDocument;
  readonly formatSnapshot?: Readonly<Record<string, unknown>>;
  readonly ruleSnapshot: ValidationRuleBundleInput | Readonly<Record<string, unknown>>;
  readonly file?: ValidationFileMetadata;
  readonly aiFindings?: readonly AiValidationFinding[];
  readonly requestedBy?: string | null;
}

export interface ValidationWorkerResult {
  readonly run: ValidationRunRecord;
  readonly status: "PASS" | "WARNING" | "ERROR" | "FAILED";
  readonly resultCount: number;
  readonly summary: Readonly<Record<string, unknown>>;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

export function createValidationWorkerHandler(dependencies: { readonly repositories: ValidationRepositories }) {
  const handle = async (input: ValidationWorkerInput): Promise<ValidationWorkerResult> => {
    let run = input.validationRunId ? await dependencies.repositories.getRun(input.workspaceId, input.validationRunId) : null;
    if (!run) {
      run = await dependencies.repositories.createRun({
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        formatSnapshotJson: input.formatSnapshot ?? {},
        ruleSnapshotJson: record(input.ruleSnapshot),
        ...(input.validationRunId ? { id: input.validationRunId } : {}),
        ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
      });
    }
    if (run.creativeVersionId !== input.creativeVersionId) throw new Error("Validation run creative version mismatch");
    if (run.status === "PASS" || run.status === "WARNING" || run.status === "ERROR") {
      const existing = await dependencies.repositories.listResults(input.workspaceId, run.id);
      return { run, status: run.status, resultCount: existing.length, summary: run.summaryJson };
    }
    await dependencies.repositories.updateRun(input.workspaceId, run.id, { status: "RUNNING", summaryJson: {}, completedAt: null });
    try {
      const compiled = compileValidationRuleBundle(input.ruleSnapshot as ValidationRuleBundleInput, { snapshotId: `validation-${run.id}` });
      const deterministic = runDeterministicValidation({
        creativeDocument: input.creativeDocument,
        rules: compiled.rules,
        ...(input.file === undefined ? {} : { file: input.file }),
        ...(input.formatSnapshot === undefined ? {} : { formatProfile: input.formatSnapshot }),
      });
      const aggregate = aggregateValidationFindings(deterministic.findings, input.aiFindings ?? []);
      const saved = await dependencies.repositories.appendResults(aggregate.findings.map((finding) => ({
        workspaceId: input.workspaceId,
        validationRunId: run!.id,
        ruleCode: finding.ruleCode,
        ruleVersion: finding.sourceRuleVersion,
        resultType: finding.resultType,
        severity: finding.severity,
        status: "OPEN" as const,
        targetElementIdsJson: finding.targetElementIds,
        message: finding.message,
        detailsJson: { ...finding.details, evidence: finding.evidence, stableKey: finding.stableKey },
        ...(finding.suggestedFix && typeof finding.suggestedFix === "object" ? { suggestedFixJson: finding.suggestedFix as Readonly<Record<string, unknown>> } : {}),
        ...(finding.confidence === undefined ? {} : { confidence: finding.confidence }),
      })));
      const completed = await dependencies.repositories.updateRun(input.workspaceId, run!.id, { status: aggregate.status, summaryJson: aggregate.summary, completedAt: new Date().toISOString() });
      return { run: completed, status: aggregate.status, resultCount: saved.length, summary: aggregate.summary };
    } catch (error) {
      const failed = await dependencies.repositories.updateRun(input.workspaceId, run.id, { status: "FAILED", summaryJson: { error: error instanceof Error ? error.message : "Validation failed" }, completedAt: new Date().toISOString() });
      return { run: failed, status: "FAILED", resultCount: 0, summary: failed.summaryJson };
    }
  };
  return { handle };
}
