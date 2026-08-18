import type { ErrorRegistryEntry, Severity, ValidationIssue, ValidationStage } from "./types.js";

const severityRank: Readonly<Record<Severity, number>> = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
};

const stageRank: Readonly<Record<ValidationStage, number>> = {
  PRE_RENDER: 0,
  POST_RENDER: 1,
};

export function createIssue(
  registry: ReadonlyMap<string, ErrorRegistryEntry>,
  code: string,
  path: string,
  detail: {
    expected?: unknown;
    actual?: unknown;
    bbox?: ValidationIssue["bbox"];
    elementId?: string | undefined;
    assetId?: string | undefined;
    formatProfileId?: string | undefined;
    stage?: ValidationStage;
  } = {},
): ValidationIssue {
  const entry = registry.get(code);
  if (!entry) throw new Error(`Unknown KBR error code: ${code}`);
  const issue: ValidationIssue = {
    code: entry.code,
    severity: entry.severity,
    path,
    messageKey: entry.messageKey,
  };
  if (detail.expected !== undefined) issue.expected = detail.expected;
  if (detail.actual !== undefined) issue.actual = detail.actual;
  if (detail.bbox !== undefined) issue.bbox = detail.bbox;
  if (detail.elementId !== undefined) issue.elementId = detail.elementId;
  if (detail.assetId !== undefined) issue.assetId = detail.assetId;
  if (detail.formatProfileId !== undefined) issue.formatProfileId = detail.formatProfileId;
  if (detail.stage !== undefined) issue.stage = detail.stage;
  return issue;
}

export function sortAndDedupeIssues(issues: readonly ValidationIssue[]): ValidationIssue[] {
  const sorted = [...issues].sort((left, right) =>
    severityRank[left.severity] - severityRank[right.severity] ||
    (left.stage && right.stage ? stageRank[left.stage] - stageRank[right.stage] : left.stage ? -1 : right.stage ? 1 : 0) ||
    left.path.localeCompare(right.path, "en") ||
    left.code.localeCompare(right.code, "en") ||
    left.messageKey.localeCompare(right.messageKey, "en"),
  );
  const seen = new Set<string>();
  return sorted.filter((issue) => {
    const key = `${issue.severity}\u0000${issue.stage ?? ""}\u0000${issue.path}\u0000${issue.code}\u0000${issue.messageKey}\u0000${issue.elementId ?? ""}\u0000${issue.assetId ?? ""}\u0000${issue.formatProfileId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function splitIssues(issues: readonly ValidationIssue[]): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
} {
  return {
    errors: issues.filter(({ severity }) => severity === "ERROR"),
    warnings: issues.filter(({ severity }) => severity === "WARNING"),
    infos: issues.filter(({ severity }) => severity === "INFO"),
  };
}
