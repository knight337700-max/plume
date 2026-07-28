import {
  parseAndValidate,
  type JsonSchema,
  type SchemaError,
  type ValidationResult,
} from "./result-validator.js";

export type { JsonSchema } from "./result-validator.js";

export interface RepairRequest {
  readonly errorPaths: readonly Pick<SchemaError, "path" | "keyword" | "message">[];
}

export type RepairFunction = (request: RepairRequest) => Promise<unknown> | unknown;

export type ResultValidationOutcome<T> =
  | { readonly status: "SUCCESS"; readonly value: T; readonly repairAttempts: 0 | 1 }
  | {
      readonly status: "PERMANENT_FAILURE";
      readonly errors: readonly SchemaError[];
      readonly repairAttempts: 0 | 1;
    };

export async function validateWithOneRepair<T>(input: {
  readonly raw: string | unknown;
  readonly schema: JsonSchema;
  readonly repair?: RepairFunction;
}): Promise<ResultValidationOutcome<T>> {
  const initial = parseAndValidate<T>(input.raw, input.schema);
  if (initial.valid) return { status: "SUCCESS", value: initial.value, repairAttempts: 0 };
  if (!input.repair)
    return { status: "PERMANENT_FAILURE", errors: initial.errors, repairAttempts: 0 };
  const repaired = await input.repair({
    errorPaths: initial.errors.map(({ path, keyword, message }) => ({ path, keyword, message })),
  });
  const second = parseAndValidate<T>(repaired, input.schema);
  return second.valid
    ? { status: "SUCCESS", value: second.value, repairAttempts: 1 }
    : { status: "PERMANENT_FAILURE", errors: second.errors, repairAttempts: 1 };
}

export function assertValidResult<T>(result: ValidationResult<T>): T {
  if (!result.valid)
    throw new Error(
      `Invalid agent result at ${result.errors.map((error) => error.path).join(", ")}`,
    );
  return result.value;
}
