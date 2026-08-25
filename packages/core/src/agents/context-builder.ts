import { createHash } from "node:crypto";
import type { AgentCode } from "./prompt-registry.js";
import { canonicalJson, redactSensitiveContext } from "./context-redaction.js";

export interface ReferencedEntityVersion {
  readonly entityType: string;
  readonly entityId: string;
  readonly version: string;
}

export interface ContextPackage {
  readonly contextPackageId: string;
  readonly workspaceId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly locale: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly referencedFileIds: readonly string[];
  readonly referencedEntityVersions: readonly ReferencedEntityVersion[];
  readonly redactionSummary: readonly string[];
  readonly contentHash: string;
}

export interface ContextBuilderInput {
  readonly contextPackageId?: string;
  readonly agentCode: AgentCode;
  readonly workspaceId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly locale?: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly referencedFileIds?: readonly string[];
  readonly referencedEntityVersions?: readonly ReferencedEntityVersion[];
}

const MINIMUM_KEYS: Readonly<Record<AgentCode, readonly string[]>> = Object.freeze({
  CAMPAIGN_ANALYST: ["sourceIds", "sourceText", "citations", "brandProfile"],
  PRODUCT_MATCHER: ["productNames", "candidates", "products"],
  ASSET_CURATOR: ["product", "channel", "formatProfile", "brief", "assets"],
  COPY_GENERATOR: ["brief", "product", "textSlots", "brandProfile"],
  LAYOUT_PLANNER: ["assets", "template", "channel", "formatProfile", "safeZones", "copy"],
  NATURAL_LANGUAGE_EDITOR: ["creativeDocument", "editRequest", "validation"],
  AI_POLICY_REVIEWER: ["render", "brief", "product", "rules", "landingSnapshot", "channel", "formatProfile"],
  EXPORT_ASSISTANT: ["campaign", "creative", "channel", "formatProfile", "exportRecipe"],
});

function assertWorkspaceScope(value: unknown, workspaceId: string, path = "$data"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertWorkspaceScope(item, workspaceId, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "workspaceId" || key === "workspace_id") && child !== workspaceId) {
      throw new Error(`Cross-workspace context rejected at ${path}.${key}`);
    }
    assertWorkspaceScope(child, workspaceId, `${path}.${key}`);
  }
}

export function buildAgentContext(input: ContextBuilderInput): ContextPackage {
  if (!input.workspaceId.trim() || !input.subjectId.trim())
    throw new Error("workspaceId and subjectId are required");
  assertWorkspaceScope(input.data, input.workspaceId);
  const selected = Object.fromEntries(
    MINIMUM_KEYS[input.agentCode]
      .filter((key) => Object.prototype.hasOwnProperty.call(input.data, key))
      .map((key) => [key, input.data[key]]),
  );
  const redacted = redactSensitiveContext(selected);
  const base = {
    contextPackageId:
      input.contextPackageId ?? `${input.agentCode}:${input.subjectType}:${input.subjectId}`,
    workspaceId: input.workspaceId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    locale: input.locale ?? "ko-KR",
    data: redacted.value as Readonly<Record<string, unknown>>,
    referencedFileIds: [...(input.referencedFileIds ?? [])].sort(),
    referencedEntityVersions: [...(input.referencedEntityVersions ?? [])].sort((left, right) =>
      `${left.entityType}:${left.entityId}:${left.version}`.localeCompare(
        `${right.entityType}:${right.entityId}:${right.version}`,
      ),
    ),
    redactionSummary: redacted.paths,
  };
  const contentHash = createHash("sha256").update(canonicalJson(base)).digest("hex");
  return Object.freeze({ ...base, contentHash });
}
