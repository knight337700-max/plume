import type { WorkspaceRole } from "../iam/repositories.js";
import type { ValidationResultRecord, ValidationRunRecord, WarningAcknowledgementRecord } from "../validation/repositories.js";

export interface ApprovalPolicyInput {
  readonly currentCreativeVersionId: string;
  readonly validationRun: ValidationRunRecord | null;
  readonly validationResults?: readonly ValidationResultRecord[];
  readonly warningAcknowledgements?: readonly WarningAcknowledgementRecord[];
  readonly requesterId?: string | null;
  readonly actorId?: string | null;
  readonly actorRole: WorkspaceRole;
  readonly selfApprovalAllowed: boolean;
}

function denied(code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { code, statusCode: code === "ROLE_NOT_ALLOWED" || code === "SELF_APPROVAL_DENIED" ? 403 : 409 });
  return error;
}

function assertRole(role: WorkspaceRole): void {
  if (!(role === "OWNER" || role === "ADMIN" || role === "REVIEWER")) throw denied("ROLE_NOT_ALLOWED", "Only a reviewer can decide approval");
}

function assertCurrentValidation(input: ApprovalPolicyInput): ValidationRunRecord {
  if (!input.validationRun) throw denied("VALIDATION_REQUIRED", "A validation run is required");
  if (input.validationRun.creativeVersionId !== input.currentCreativeVersionId) throw denied("STALE_VALIDATION", "Validation run does not target the current Creative version");
  if (!(input.validationRun.status === "PASS" || input.validationRun.status === "WARNING")) throw denied("VALIDATION_NOT_COMPLETE", "Validation must complete before approval");
  return input.validationRun;
}

function assertNoOpenErrors(input: ApprovalPolicyInput): void {
  const summaryErrors = Number(input.validationRun?.summaryJson.errorCount ?? 0);
  const openErrors = (input.validationResults ?? []).filter((result) => result.severity === "ERROR" && result.status === "OPEN").length;
  if (summaryErrors > 0 || openErrors > 0) throw denied("VALIDATION_ERROR_OPEN", "Open validation errors block approval");
}

function assertWarningsAcknowledged(input: ApprovalPolicyInput): void {
  const warningIds = new Set((input.warningAcknowledgements ?? []).map((item) => item.validationResultId));
  const unacknowledged = (input.validationResults ?? []).some((result) => result.severity === "WARNING" && result.status === "OPEN" && !warningIds.has(result.id));
  if (unacknowledged) throw denied("WARNING_ACKNOWLEDGEMENT_REQUIRED", "Every open warning requires an acknowledgement");
}

export function assertCanRequestApproval(input: ApprovalPolicyInput): void {
  assertCurrentValidation(input);
  assertNoOpenErrors(input);
  if (input.requesterId && input.actorId && input.requesterId === input.actorId && !input.selfApprovalAllowed) throw denied("SELF_APPROVAL_DENIED", "Workspace policy does not allow self approval");
}

export function assertCanApprove(input: ApprovalPolicyInput): void {
  assertRole(input.actorRole);
  assertCurrentValidation(input);
  assertNoOpenErrors(input);
  assertWarningsAcknowledged(input);
  if (input.requesterId && input.actorId && input.requesterId === input.actorId && !input.selfApprovalAllowed) throw denied("SELF_APPROVAL_DENIED", "Workspace policy does not allow self approval");
}

export const canRequestApproval = (input: ApprovalPolicyInput): boolean => { try { assertCanRequestApproval(input); return true; } catch { return false; } };
export const canApprove = (input: ApprovalPolicyInput): boolean => { try { assertCanApprove(input); return true; } catch { return false; } };
