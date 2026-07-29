import { randomUUID } from "node:crypto";
import type { CreativeDocument } from "../creative/creative-document.js";
import type { RuleActivation } from "./rule-types.js";

export type ValidationRunStatus = "QUEUED" | "RUNNING" | "PASS" | "WARNING" | "ERROR" | "FAILED";
export type ValidationResultStatus = "OPEN" | "FIXED" | "ACKNOWLEDGED" | "NOT_APPLICABLE";
export type ValidationResultType = "DETERMINISTIC" | "AI_ASSISTED";

export interface ValidationRunRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly asyncJobId?: string | null;
  readonly runNo: number;
  readonly status: ValidationRunStatus;
  readonly formatSnapshotJson: Readonly<Record<string, unknown>>;
  readonly ruleSnapshotJson: Readonly<Record<string, unknown>>;
  readonly inputRenderId?: string | null;
  readonly summaryJson: Readonly<Record<string, unknown>>;
  readonly requestedBy?: string | null;
  readonly createdAt: string;
  readonly completedAt?: string | null;
}

export interface ValidationResultRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly validationRunId: string;
  readonly ruleDefinitionId?: string | null;
  readonly ruleCode: string;
  readonly ruleVersion: string;
  readonly resultType: ValidationResultType;
  readonly severity: RuleActivation;
  readonly status: ValidationResultStatus;
  readonly targetElementIdsJson: readonly string[];
  readonly message: string;
  readonly detailsJson: Readonly<Record<string, unknown>>;
  readonly suggestedFixJson?: Readonly<Record<string, unknown>> | null;
  readonly confidence?: number | null;
  readonly createdAt: string;
}

export interface WarningAcknowledgementRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly validationResultId: string;
  readonly acknowledgedBy: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface CreateValidationRunInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly creativeVersionId: string;
  readonly formatSnapshotJson: Readonly<Record<string, unknown>>;
  readonly ruleSnapshotJson: Readonly<Record<string, unknown>>;
  readonly inputRenderId?: string | null;
  readonly requestedBy?: string | null;
  readonly asyncJobId?: string | null;
}

export interface ValidationRepositories {
  createRun(input: CreateValidationRunInput): Promise<ValidationRunRecord>;
  getRun(workspaceId: string, id: string): Promise<ValidationRunRecord | null>;
  listRuns(workspaceId: string, creativeVersionId: string): Promise<readonly ValidationRunRecord[]>;
  updateRun(workspaceId: string, id: string, patch: Pick<ValidationRunRecord, "status" | "summaryJson" | "completedAt">): Promise<ValidationRunRecord>;
  appendResults(items: readonly Omit<ValidationResultRecord, "id" | "createdAt">[]): Promise<readonly ValidationResultRecord[]>;
  listResults(workspaceId: string, validationRunId: string): Promise<readonly ValidationResultRecord[]>;
  getResult(workspaceId: string, id: string): Promise<ValidationResultRecord | null>;
  acknowledgeWarning(input: Omit<WarningAcknowledgementRecord, "id" | "createdAt"> & { id?: string }): Promise<WarningAcknowledgementRecord>;
  getAcknowledgement(workspaceId: string, validationResultId: string): Promise<WarningAcknowledgementRecord | null>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function notFound(kind: string): Error {
  const error = new Error(`${kind} not found`);
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

export function createInMemoryValidationRepositories(seed: {
  readonly runs?: readonly ValidationRunRecord[];
  readonly results?: readonly ValidationResultRecord[];
  readonly acknowledgements?: readonly WarningAcknowledgementRecord[];
} = {}): ValidationRepositories {
  const runs = new Map(seed.runs?.map((item) => [item.id, item]) ?? []);
  const results = new Map(seed.results?.map((item) => [item.id, item]) ?? []);
  const acknowledgements = new Map(seed.acknowledgements?.map((item) => [item.validationResultId, item]) ?? []);
  return {
    async createRun(input) {
      const runNo = Math.max(0, ...[...runs.values()].filter((item) => item.workspaceId === input.workspaceId && item.creativeVersionId === input.creativeVersionId).map((item) => item.runNo)) + 1;
      const created: ValidationRunRecord = Object.freeze({
        id: input.id ?? randomUUID(),
        workspaceId: input.workspaceId,
        creativeVersionId: input.creativeVersionId,
        ...(input.asyncJobId === undefined ? {} : { asyncJobId: input.asyncJobId }),
        runNo,
        status: "QUEUED",
        formatSnapshotJson: Object.freeze(clone(input.formatSnapshotJson)),
        ruleSnapshotJson: Object.freeze(clone(input.ruleSnapshotJson)),
        ...(input.inputRenderId === undefined ? {} : { inputRenderId: input.inputRenderId }),
        summaryJson: Object.freeze({}),
        ...(input.requestedBy === undefined ? {} : { requestedBy: input.requestedBy }),
        createdAt: new Date().toISOString(),
      });
      runs.set(created.id, created);
      return created;
    },
    async getRun(workspaceId, id) {
      const item = runs.get(id);
      return item?.workspaceId === workspaceId ? item : null;
    },
    async listRuns(workspaceId, creativeVersionId) {
      return [...runs.values()].filter((item) => item.workspaceId === workspaceId && item.creativeVersionId === creativeVersionId).sort((left, right) => right.runNo - left.runNo);
    },
    async updateRun(workspaceId, id, patch) {
      const current = runs.get(id);
      if (!current || current.workspaceId !== workspaceId) throw notFound("Validation run");
      const updated = Object.freeze({ ...current, ...patch, summaryJson: Object.freeze(clone(patch.summaryJson)) });
      runs.set(id, updated);
      return updated;
    },
    async appendResults(items) {
      const created: ValidationResultRecord[] = [];
      for (const input of items) {
        const run = runs.get(input.validationRunId);
        if (!run || run.workspaceId !== input.workspaceId) throw notFound("Validation run");
        const item: ValidationResultRecord = Object.freeze({ id: randomUUID(), ...input, targetElementIdsJson: [...input.targetElementIdsJson], detailsJson: Object.freeze(clone(input.detailsJson)), createdAt: new Date().toISOString() });
        results.set(item.id, item);
        created.push(item);
      }
      return created;
    },
    async listResults(workspaceId, validationRunId) {
      const run = runs.get(validationRunId);
      if (!run || run.workspaceId !== workspaceId) throw notFound("Validation run");
      return [...results.values()].filter((item) => item.workspaceId === workspaceId && item.validationRunId === validationRunId).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async getResult(workspaceId, id) {
      const item = results.get(id);
      return item?.workspaceId === workspaceId ? item : null;
    },
    async acknowledgeWarning(input) {
      const result = results.get(input.validationResultId);
      if (!result || result.workspaceId !== input.workspaceId) throw notFound("Validation result");
      if (result.severity !== "WARNING") throw new Error("Only warnings can be acknowledged");
      const current = acknowledgements.get(input.validationResultId);
      if (current) return current;
      const item: WarningAcknowledgementRecord = Object.freeze({ id: input.id ?? randomUUID(), ...input, createdAt: new Date().toISOString() });
      acknowledgements.set(item.validationResultId, item);
      results.set(result.id, Object.freeze({ ...result, status: "ACKNOWLEDGED" }));
      return item;
    },
    async getAcknowledgement(workspaceId, validationResultId) {
      const item = acknowledgements.get(validationResultId);
      return item?.workspaceId === workspaceId ? item : null;
    },
  };
}
