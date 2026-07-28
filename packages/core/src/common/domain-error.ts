export type DomainErrorCode =
  | "RESOURCE_NOT_FOUND"
  | "STATE_TRANSITION_CONFLICT"
  | "DOMAIN_POLICY_DENIED"
  | "REVISION_MISMATCH"
  | "VALIDATION_ERROR_OPEN"
  | "INTERNAL_ERROR"
  | "DEPENDENCY_ERROR";

export interface DomainErrorOptions {
  readonly code?: DomainErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "DomainError";
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = Object.freeze({ ...(options.details ?? {}) });
  }
}

export function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  return new DomainError("An unexpected domain error occurred", { cause: error });
}

export function toApiErrorCode(error: unknown): DomainErrorCode {
  return toDomainError(error).code;
}
