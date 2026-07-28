import {
  toDomainError,
  type DomainError,
} from "../../../../packages/core/src/common/domain-error.js";

export interface ApiProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly requestId?: string;
  readonly errors?: readonly {
    readonly path: string;
    readonly message: string;
    readonly code: string;
  }[];
}

const statusByCode: Readonly<Record<string, number>> = Object.freeze({
  RESOURCE_NOT_FOUND: 404,
  STATE_TRANSITION_CONFLICT: 409,
  DOMAIN_POLICY_DENIED: 403,
  REVISION_MISMATCH: 412,
  VALIDATION_ERROR_OPEN: 422,
  INTERNAL_ERROR: 500,
  DEPENDENCY_ERROR: 502,
});

function validationErrors(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("validation" in error) ||
    !Array.isArray(error.validation)
  )
    return undefined;
  return error.validation.map(
    (item: { instancePath?: string; message?: string; keyword?: string }) => ({
      path: item.instancePath ?? "",
      message: item.message ?? "Field validation failed",
      code: "FIELD_VALIDATION_FAILED",
      keyword: item.keyword,
    }),
  );
}

export function mapError(error: unknown, requestId?: string): ApiProblem {
  const fields = validationErrors(error);
  if (fields) {
    return {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "FIELD_VALIDATION_FAILED",
      detail: "The request contains invalid fields.",
      ...(requestId ? { requestId } : {}),
      errors: fields,
    };
  }

  const domain: DomainError = toDomainError(error);
  const status = statusByCode[domain.code] ?? 500;
  return {
    type: "about:blank",
    title: status >= 500 ? "Internal Server Error" : "Request Failed",
    status,
    code: domain.code,
    detail: status >= 500 ? "An unexpected error occurred." : domain.message,
    ...(requestId ? { requestId } : {}),
  };
}
