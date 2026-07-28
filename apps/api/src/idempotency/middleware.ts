import type { IdempotencyRepository } from "./repository.js";
import { hashRequestBody } from "./repository.js";

export interface IdempotencyInput {
  readonly workspaceId: string;
  readonly key: string;
  readonly body: unknown;
}

export interface IdempotencyResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

function conflict(): Error {
  const error = new Error("Idempotency key was already used with a different payload");
  Object.assign(error, { code: "IDEMPOTENCY_PAYLOAD_CONFLICT", statusCode: 409 });
  return error;
}

export async function runIdempotent<T extends IdempotencyResponse>(
  repository: IdempotencyRepository,
  input: IdempotencyInput,
  handler: () => Promise<T>,
): Promise<T | IdempotencyResponse> {
  if (!input.key.trim()) throw new Error("Idempotency-Key is required");
  const requestHash = hashRequestBody(input.body);
  const existing = await repository.find(input.workspaceId, input.key);
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflict();
    return { statusCode: existing.statusCode, body: existing.responseBody };
  }
  const response = await handler();
  const stored = await repository.insert({
    workspaceId: input.workspaceId,
    key: input.key,
    requestHash,
    statusCode: response.statusCode,
    responseBody: response.body,
  });
  if (stored.requestHash !== requestHash) throw conflict();
  return { statusCode: stored.statusCode, body: stored.responseBody };
}
