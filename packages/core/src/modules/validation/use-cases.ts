import type { ValidationRuleBundleInput } from "./rule-types.js";
import type {
  ValidationRepositories,
  ValidationResultRecord,
  ValidationRunRecord,
  WarningAcknowledgementRecord,
} from "./repositories.js";

export interface ValidationRunInput {
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly formatSnapshotJson?: Readonly<Record<string, unknown>>;
  readonly ruleSnapshotJson?: ValidationRuleBundleInput | Readonly<Record<string, unknown>>;
  readonly requestedBy?: string | null;
}

export interface ValidationUseCases {
  run(input: ValidationRunInput): Promise<ValidationRunRecord>;
  listRuns(workspaceId: string, creativeVersionId: string): Promise<readonly ValidationRunRecord[]>;
  getRun(workspaceId: string, validationRunId: string): Promise<ValidationRunRecord | null>;
  listResults(workspaceId: string, validationRunId: string): Promise<readonly ValidationResultRecord[]>;
  acknowledgeWarning(input: { readonly workspaceId: string; readonly resultId: string; readonly acknowledgedBy: string; readonly reason: string }): Promise<WarningAcknowledgementRecord>;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {};
}

export function createValidationUseCases(repositories: ValidationRepositories): ValidationUseCases {
  return {
    async run(input) {
      return repositories.createRun({
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        formatSnapshotJson: input.formatSnapshotJson ?? {},
        ruleSnapshotJson: record(input.ruleSnapshotJson),
        ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
      });
    },
    listRuns: (workspaceId, creativeVersionId) => repositories.listRuns(workspaceId, creativeVersionId),
    getRun: (workspaceId, validationRunId) => repositories.getRun(workspaceId, validationRunId),
    listResults: (workspaceId, validationRunId) => repositories.listResults(workspaceId, validationRunId),
    acknowledgeWarning: (input) => repositories.acknowledgeWarning({ workspaceId: input.workspaceId, validationResultId: input.resultId, acknowledgedBy: input.acknowledgedBy, reason: input.reason }),
  };
}
