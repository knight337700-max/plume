import { describe, expect, it } from "vitest";

import { API_ERROR_CODE_COUNT, API_ERROR_CODES, isApiErrorCode } from "./error-codes.js";
import { createFieldError, createProblem, unknownServerProblem } from "./problem.js";

describe("API problem contracts", () => {
  it("represents all 39 documented error codes", () => {
    expect(API_ERROR_CODE_COUNT).toBe(39);
    expect(API_ERROR_CODES).toHaveLength(39);
    expect(isApiErrorCode("INVALID_REQUEST")).toBe(true);
    expect(isApiErrorCode("NOT_A_DOCUMENTED_CODE")).toBe(false);
  });

  it("represents field errors in the problem envelope", () => {
    const field = createFieldError({ path: "email", message: "Required" });
    const problem = createProblem({
      status: 400,
      code: "FIELD_VALIDATION_FAILED",
      errors: [field],
    });

    expect(problem.status).toBe(400);
    expect(problem.errors).toEqual([field]);
  });

  it("does not expose an unknown server cause", () => {
    const problem = unknownServerProblem("/request/123");

    expect(problem.code).toBe("INTERNAL_ERROR");
    expect(problem.detail).not.toContain("password");
    expect(problem.instance).toBe("/request/123");
  });
});
