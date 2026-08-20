import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import type { ContractBundle } from "./contracts.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import type {
  KakaoBizboardInputV1,
  RenderManifest,
  RenderResponse,
  ValidationIssue,
} from "./types.js";
import type { MultiArtifactCollectionManifest } from "@kbr/renderer-contract";

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function errorPointer(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = (error.params as { missingProperty?: string }).missingProperty;
    if (missingProperty) return `${error.instancePath}/${escapeJsonPointer(missingProperty)}`;
  }
  return error.instancePath || "/";
}

function mappedCode(error: ErrorObject, contracts: ContractBundle): string {
  const mapping = contracts.ajvErrorMapping.keywordMappings.find(({ keyword }) => keyword === error.keyword);
  if (!mapping) return contracts.ajvErrorMapping.defaultCode;
  const pointer = errorPointer(error);
  for (const override of mapping.pathOverrides) {
    if (override.pointers.includes(pointer)) return override.code;
  }
  return mapping.defaultCode;
}

function mapAjvErrors(errors: readonly ErrorObject[], contracts: ContractBundle): ValidationIssue[] {
  return sortAndDedupeIssues(
    errors.map((error) =>
      createIssue(contracts.errorRegistry, mappedCode(error, contracts), errorPointer(error), {
        expected: error.params,
      }),
    ),
  );
}

export class SchemaValidators {
  readonly #contracts: ContractBundle;
  readonly #input: ValidateFunction<KakaoBizboardInputV1>;
  readonly #naverInput: ValidateFunction<Record<string, unknown>>;
  readonly #manifest: ValidateFunction<RenderManifest>;
  readonly #response: ValidateFunction<RenderResponse>;
  readonly #multiArtifactManifest: ValidateFunction<MultiArtifactCollectionManifest>;

  constructor(contracts: ContractBundle) {
    this.#contracts = contracts;
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      allowUnionTypes: true,
    });
    this.#input = ajv.compile<KakaoBizboardInputV1>(contracts.inputSchema);
    this.#naverInput = ajv.compile<Record<string, unknown>>(contracts.naverInputSchema);
    this.#manifest = ajv.compile<RenderManifest>(contracts.manifestSchema);
    this.#response = ajv.compile<RenderResponse>(contracts.responseSchema);
    this.#multiArtifactManifest = ajv.compile<MultiArtifactCollectionManifest>(contracts.multiArtifactManifestSchema);
  }

  validateInput(value: unknown): { valid: true; value: KakaoBizboardInputV1 } | { valid: false; issues: ValidationIssue[] } {
    if (this.#input(value)) return { valid: true, value };
    return { valid: false, issues: mapAjvErrors(this.#input.errors ?? [], this.#contracts) };
  }

  validateNaverInput(value: unknown): { valid: true; value: Record<string, unknown> } | { valid: false; issues: ValidationIssue[] } {
    if (this.#naverInput(value)) return { valid: true, value: value as Record<string, unknown> };
    return { valid: false, issues: mapAjvErrors(this.#naverInput.errors ?? [], this.#contracts) };
  }

  assertManifest(value: unknown): asserts value is RenderManifest {
    if (!this.#manifest(value)) {
      throw new Error(`Internal render manifest schema mismatch: ${JSON.stringify(this.#manifest.errors)}`);
    }
  }

  assertResponse(value: unknown): asserts value is RenderResponse {
    if (!this.#response(value)) {
      throw new Error(`Internal response schema mismatch: ${JSON.stringify(this.#response.errors)}`);
    }
  }

  assertMultiArtifactManifest(value: unknown): asserts value is MultiArtifactCollectionManifest {
    if (!this.#multiArtifactManifest(value)) {
      throw new Error(`Internal collection manifest schema mismatch: ${JSON.stringify(this.#multiArtifactManifest.errors)}`);
    }
  }
}

export function parseJsonInput(
  text: string,
  contracts: ContractBundle,
): { valid: true; value: unknown } | { valid: false; issues: ValidationIssue[] } {
  try {
    return { valid: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      valid: false,
      issues: [createIssue(contracts.errorRegistry, "KBR-INPUT-001", "/")],
    };
  }
}
