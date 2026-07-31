import { COMMAND_QUEUE_ROUTES, type AsyncCommand } from "../../../packages/core/src/async/queue-routing.js";
import type { CommandEnvelope } from "../../../packages/core/src/async/message-envelope.js";

export type JacomoExternalCommand = "creative.generate";
export type JacomoInternalCommand =
  | "creative.render"
  | "validation.run"
  | "export.render"
  | "export.render_and_package";

export const JACOMO_EXTERNAL_COMMANDS = Object.freeze(["creative.generate"] as const);
export const JACOMO_INTERNAL_COMMANDS = Object.freeze([
  "creative.render",
  "validation.run",
  "export.render",
  "export.render_and_package",
] as const);
export const JACOMO_OPTIONAL_COMMANDS = Object.freeze(
  Object.keys(COMMAND_QUEUE_ROUTES).filter(
    (command) =>
      !JACOMO_EXTERNAL_COMMANDS.includes(command as JacomoExternalCommand) &&
      !JACOMO_INTERNAL_COMMANDS.includes(command as JacomoInternalCommand),
  ) as Exclude<AsyncCommand, JacomoExternalCommand | JacomoInternalCommand>[],
);

export interface CreativeGeneratePayload {
  readonly campaignId: string;
  readonly productIds: readonly string[];
  readonly formatProfileIds: readonly string[];
  readonly variantCountPerProduct: number;
  readonly generationMode?: "MOCK_AI";
}

export interface CreativeRenderPayload {
  readonly creativeVersionId: string;
  readonly campaignId?: string;
  readonly productId?: string;
  readonly creativeDocument: Readonly<Record<string, unknown>>;
  readonly purpose: "PREVIEW" | "VALIDATION" | "FINAL_EXPORT";
  readonly outputProfile: {
    readonly mimeType: "image/png";
    readonly width: number;
    readonly height: number;
    readonly maxBytes?: number | null;
    readonly transparentBackground?: boolean;
  };
}

export interface ValidationRunPayload {
  readonly creativeVersionId: string;
  readonly validationRunId?: string;
  readonly creativeDocument: Readonly<Record<string, unknown>>;
  readonly formatSnapshot?: Readonly<Record<string, unknown>>;
  readonly ruleSnapshot: Readonly<Record<string, unknown>>;
}

export interface ExportPackagePayload {
  readonly exportJobId: string;
  readonly creativeVersionIds: readonly string[];
  readonly renderObjectKeys: readonly string[];
  readonly packageName: string;
}

export type AsyncCommandPayload =
  | CreativeGeneratePayload
  | CreativeRenderPayload
  | ValidationRunPayload
  | ExportPackagePayload
  | Readonly<Record<string, unknown>>;

export interface AsyncCommandDefinition {
  readonly command: AsyncCommand;
  readonly queue: (typeof COMMAND_QUEUE_ROUTES)[AsyncCommand];
  readonly schemaVersion: 1;
  readonly payloadSchemaId: string;
  readonly activation: "external-entry" | "internal-step" | "optional";
  readonly validatePayload: (payload: unknown) => payload is AsyncCommandPayload;
}

export class AsyncContractError extends Error {
  readonly code = "ASYNC_CONTRACT_INVALID";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "AsyncContractError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isString);
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isUuidLike = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);

function validateCreativeGenerate(payload: unknown): payload is CreativeGeneratePayload {
  if (!isRecord(payload)) return false;
  return (
    isString(payload.campaignId) &&
    isStringArray(payload.productIds) &&
    payload.productIds.length > 0 &&
    isStringArray(payload.formatProfileIds) &&
    payload.formatProfileIds.length > 0 &&
    isPositiveInteger(payload.variantCountPerProduct) &&
    (payload.generationMode === undefined || payload.generationMode === "MOCK_AI")
  );
}

function validateRender(payload: unknown): payload is CreativeRenderPayload {
  if (!isRecord(payload) || !isString(payload.creativeVersionId) || !isRecord(payload.creativeDocument)) return false;
  const profile = payload.outputProfile;
  return (
    (payload.purpose === "PREVIEW" || payload.purpose === "VALIDATION" || payload.purpose === "FINAL_EXPORT") &&
    isRecord(profile) &&
    profile.mimeType === "image/png" &&
    isPositiveInteger(profile.width) &&
    isPositiveInteger(profile.height)
  );
}

function validateValidation(payload: unknown): payload is ValidationRunPayload {
  if (!isRecord(payload)) return false;
  return (
    isString(payload.creativeVersionId) &&
    isRecord(payload.creativeDocument) &&
    isRecord(payload.ruleSnapshot) &&
    (payload.validationRunId === undefined || isString(payload.validationRunId))
  );
}

function validateExport(payload: unknown): payload is ExportPackagePayload {
  if (!isRecord(payload)) return false;
  return (
    isString(payload.exportJobId) &&
    isStringArray(payload.creativeVersionIds) &&
    isStringArray(payload.renderObjectKeys) &&
    isString(payload.packageName)
  );
}

function genericPayload(payload: unknown): payload is AsyncCommandPayload {
  return isRecord(payload);
}

const definitions: Record<AsyncCommand, AsyncCommandDefinition> = Object.fromEntries(
  Object.keys(COMMAND_QUEUE_ROUTES).map((command) => {
    const typedCommand = command as AsyncCommand;
    const validation =
      typedCommand === "creative.generate"
        ? validateCreativeGenerate
        : typedCommand === "creative.render" || typedCommand === "creative.preview.render" || typedCommand === "validation.render" || typedCommand === "export.render"
          ? validateRender
          : typedCommand === "validation.run"
            ? validateValidation
            : typedCommand === "export.render_and_package"
              ? validateExport
              : genericPayload;
    const activation = JACOMO_EXTERNAL_COMMANDS.includes(command as JacomoExternalCommand)
      ? "external-entry"
      : JACOMO_INTERNAL_COMMANDS.includes(command as JacomoInternalCommand)
        ? "internal-step"
        : "optional";
    return [typedCommand, {
      command: typedCommand,
      queue: COMMAND_QUEUE_ROUTES[typedCommand],
      schemaVersion: 1,
      payloadSchemaId: `plume.async.${typedCommand}.v1`,
      activation,
      validatePayload: validation,
    } satisfies AsyncCommandDefinition];
  }),
) as Record<AsyncCommand, AsyncCommandDefinition>;

export const ASYNC_COMMAND_DEFINITIONS = Object.freeze(definitions);

export function getAsyncCommandDefinition(command: string): AsyncCommandDefinition {
  const definition = ASYNC_COMMAND_DEFINITIONS[command as AsyncCommand];
  if (!definition) throw new AsyncContractError(`UNKNOWN_COMMAND:${command}`);
  return definition;
}

export function validateCommandEnvelope(value: unknown): CommandEnvelope<AsyncCommandPayload> {
  if (!isRecord(value)) throw new AsyncContractError("ENVELOPE_MUST_BE_OBJECT");
  if (!isString(value.messageId) || !isUuidLike(value.messageId)) throw new AsyncContractError("MESSAGE_ID_INVALID");
  if (!isPositiveInteger(value.schemaVersion)) throw new AsyncContractError("SCHEMA_VERSION_INVALID");
  if (!isString(value.workspaceId) || !isUuidLike(value.workspaceId)) throw new AsyncContractError("WORKSPACE_ID_INVALID");
  if (!isString(value.correlationId)) throw new AsyncContractError("CORRELATION_ID_INVALID");
  if (!isString(value.jobId) || !isUuidLike(value.jobId)) throw new AsyncContractError("JOB_ID_INVALID");
  if (value.jobItemId !== undefined && (!isString(value.jobItemId) || !isUuidLike(value.jobItemId))) throw new AsyncContractError("JOB_ITEM_ID_INVALID");
  if (!isString(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) throw new AsyncContractError("CREATED_AT_INVALID");
  if (!isString(value.command)) throw new AsyncContractError("COMMAND_INVALID");
  const definition = getAsyncCommandDefinition(value.command);
  if (value.schemaVersion !== definition.schemaVersion) throw new AsyncContractError("SCHEMA_VERSION_UNSUPPORTED");
  if (!definition.validatePayload(value.payload)) throw new AsyncContractError(`PAYLOAD_INVALID:${value.command}`);
  return Object.freeze(value as unknown as CommandEnvelope<AsyncCommandPayload>);
}
