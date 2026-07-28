/** @typedef {object} FieldError */
/** @property {string} path */
/** @property {string} message */
/** @property {string} code */

/** @typedef {object} ProblemDetails */
/** @property {string} type */
/** @property {string} title */
/** @property {number} status */
/** @property {string} code */
/** @property {string} detail */
/** @property {string} [instance] */
/** @property {readonly FieldError[]} [errors] */

/** @param {{ path?: string, message?: string, code?: string }} input */
export function createFieldError(input = {}) {
  return {
    path: input.path ?? "",
    message: input.message ?? "Field validation failed",
    code: input.code ?? "FIELD_VALIDATION_FAILED",
  };
}

/** @param {{ title?: string, status?: number, code?: string, detail?: string, instance?: string, errors?: readonly FieldError[] }} input */
export function createProblem(input = {}) {
  return {
    type: "about:blank",
    title: input.title ?? "Problem",
    status: input.status ?? 500,
    code: input.code ?? "INTERNAL_ERROR",
    detail: input.detail ?? "An unexpected error occurred.",
    ...(input.instance ? { instance: input.instance } : {}),
    ...(input.errors?.length ? { errors: input.errors } : {}),
  };
}

export function unknownServerProblem(instance = "") {
  return createProblem({
    title: "Internal Server Error",
    status: 500,
    code: "INTERNAL_ERROR",
    detail: "An unexpected error occurred.",
    ...(instance ? { instance } : {}),
  });
}
