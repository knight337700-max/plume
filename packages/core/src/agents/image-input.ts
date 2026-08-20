import { createHash } from "node:crypto";

export type AgentImageMimeType = "image/png" | "image/jpeg";
export type AgentImageDetail = "low" | "high" | "auto";

export interface AgentImageInput {
  readonly fileId: string;
  readonly mimeType: AgentImageMimeType;
  readonly bytes: Uint8Array;
  readonly checksumSha256: string;
  readonly detail?: AgentImageDetail;
}

export type AgentImageInputErrorCode =
  | "AGENT_IMAGE_INPUT_INVALID"
  | "AGENT_IMAGE_INPUT_CHECKSUM_MISMATCH"
  | "AGENT_IMAGE_INPUT_DUPLICATE_FILE_ID"
  | "AGENT_IMAGE_INPUTS_REQUIRE_VISION_POLICY";

export class AgentImageInputError extends Error {
  readonly code: AgentImageInputErrorCode;

  constructor(code: AgentImageInputErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "AgentImageInputError";
    this.code = code;
  }
}

function invalid(message: string): AgentImageInputError {
  return new AgentImageInputError("AGENT_IMAGE_INPUT_INVALID", message);
}

/**
 * Validates image transport at the Core boundary. The returned array retains
 * the caller's image objects so retry and repair calls can forward the exact
 * same bytes and metadata without re-encoding or re-reading them.
 */
export function validateAgentImageInputs(
  inputs: readonly AgentImageInput[] | undefined,
): readonly AgentImageInput[] {
  const imageInputs = inputs ?? [];
  const fileIds = new Set<string>();
  for (const [index, input] of imageInputs.entries()) {
    if (!input || typeof input !== "object") throw invalid(`imageInputs[${index}] is required`);
    if (typeof input.fileId !== "string" || !input.fileId.trim())
      throw invalid(`imageInputs[${index}].fileId is required`);
    if (fileIds.has(input.fileId))
      throw new AgentImageInputError(
        "AGENT_IMAGE_INPUT_DUPLICATE_FILE_ID",
        `Duplicate image fileId: ${input.fileId}`,
      );
    fileIds.add(input.fileId);
    if (input.mimeType !== "image/png" && input.mimeType !== "image/jpeg")
      throw invalid(`imageInputs[${index}].mimeType is not supported`);
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0)
      throw invalid(`imageInputs[${index}].bytes must be non-empty`);
    if (!/^[a-f0-9]{64}$/u.test(input.checksumSha256))
      throw invalid(`imageInputs[${index}].checksumSha256 must be lowercase SHA-256`);
    if (input.detail !== undefined && !["low", "high", "auto"].includes(input.detail))
      throw invalid(`imageInputs[${index}].detail is not supported`);
    const computed = createHash("sha256").update(input.bytes).digest("hex");
    if (computed !== input.checksumSha256)
      throw new AgentImageInputError(
        "AGENT_IMAGE_INPUT_CHECKSUM_MISMATCH",
        `Image checksum mismatch for ${input.fileId}`,
      );
  }
  return imageInputs;
}
