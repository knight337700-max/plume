import {
  parseAndValidate,
  type JsonSchema,
  type SchemaError,
  type ValidationEvidence,
  type ValidationResult,
} from "./result-validator.js";

export type { JsonSchema } from "./result-validator.js";

export interface RepairRequest {
  readonly errorPaths: readonly Pick<SchemaError, "path" | "keyword" | "message">[];
}

export type RepairFunction = (request: RepairRequest) => Promise<unknown> | unknown;

export type ResultValidationOutcome<T> =
  | {
      readonly status: "SUCCESS";
      readonly value: T;
      readonly repairAttempts: 0 | 1;
      readonly validationEvidence?: ValidationEvidence;
    }
  | {
      readonly status: "PERMANENT_FAILURE";
      readonly errors: readonly SchemaError[];
      readonly repairAttempts: 0 | 1;
      readonly validationEvidence?: ValidationEvidence;
    };

export async function validateWithOneRepair<T>(input: {
  readonly raw: string | unknown;
  readonly schema: JsonSchema;
  readonly decode?: (value: unknown) => ValidationResult<T>;
  readonly repair?: RepairFunction;
  readonly onValidation?: (
    phase: "initial" | "repair",
    result: ValidationResult<T>,
  ) => Promise<void> | void;
}): Promise<ResultValidationOutcome<T>> {
  const validate = (raw: string | unknown): ValidationResult<T> => {
    if (!input.decode) return parseAndValidate<T>(raw, input.schema);
    if (typeof raw !== "string") return input.decode(raw);
    try {
      return input.decode(JSON.parse(raw));
    } catch {
      return {
        valid: false,
        errors: [{ path: "$", keyword: "json", message: "must be valid JSON" }],
        evidence: {
          jsonParseStatus: "FAIL",
          transportValidationStatus: "NOT_REACHED",
          transportErrorPaths: [],
          domainValidationStatus: "NOT_REACHED",
          domainErrorPaths: [],
        },
      };
    }
  };
  const initial = validate(input.raw);
  await input.onValidation?.("initial", initial);
  if (initial.valid)
    return {
      status: "SUCCESS",
      value: initial.value,
      repairAttempts: 0,
      ...(initial.evidence ? { validationEvidence: initial.evidence } : {}),
    };
  if (!input.repair)
    return {
      status: "PERMANENT_FAILURE",
      errors: initial.errors,
      repairAttempts: 0,
      ...(initial.evidence ? { validationEvidence: initial.evidence } : {}),
    };
  const repaired = await input.repair({
    errorPaths: initial.errors.map(({ path, keyword, message }) => ({ path, keyword, message })),
  });
  const second = validate(repaired);
  await input.onValidation?.("repair", second);
  return second.valid
    ? {
        status: "SUCCESS",
        value: second.value,
        repairAttempts: 1,
        ...(second.evidence ? { validationEvidence: second.evidence } : {}),
      }
    : {
        status: "PERMANENT_FAILURE",
        errors: second.errors,
        repairAttempts: 1,
        ...(second.evidence ? { validationEvidence: second.evidence } : {}),
      };
}

export function assertValidResult<T>(result: ValidationResult<T>): T {
  if (!result.valid)
    throw new Error(
      `Invalid agent result at ${result.errors.map((error) => error.path).join(", ")}`,
    );
  return result.value;
}
