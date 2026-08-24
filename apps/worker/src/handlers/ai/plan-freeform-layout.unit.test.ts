import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  loadCanonicalCreativeLayoutPlanSchema,
  loadResolvedCanonicalCreativeLayoutPlanSchema,
  loadFreeformFontRegistry,
  loadFreeformFormatProfileRegistry,
  type CreativeLayoutPlan,
  type FormatProfile,
} from "../../../../../packages/renderer-vendor/src/public.js";
import type { AgentImageInput } from "../../../../../packages/core/src/agents/image-input.js";
import { createStrictOutputAdapter } from "../../../../../packages/core/src/agents/strict-output-adapter.js";
import { buildAgentContext } from "../../../../../packages/core/src/agents/context-builder.js";
import {
  createAgentOrchestrator,
  type AgentOrchestrator,
  type AgentProviderGateway,
  type AgentTaskInput,
} from "../../../../../packages/core/src/agents/orchestrator.js";
import type { AgentResult } from "../../../../../packages/core/src/agents/agent-result.js";
import type { JsonSchema } from "../../../../../packages/core/src/agents/result-validator.js";
import {
  createFreeformLayoutPlannerHandler,
  type FreeformPlannerSelectedAsset,
  type PlanFreeformLayoutInput,
} from "./plan-freeform-layout.js";

const runtimeRoot = path.join(process.cwd(), "packages/renderer-vendor/upstream");
const profileRegistry = loadFreeformFormatProfileRegistry(runtimeRoot);
const fontRegistry = loadFreeformFontRegistry(runtimeRoot);
const targetProfile = profileRegistry.profiles.find(
  (profile) => profile.formatProfileId === "KAKAO_DISPLAY_NATIVE_2_1",
) as FormatProfile;
const schema = loadCanonicalCreativeLayoutPlanSchema(runtimeRoot) as JsonSchema;
type ComposedJsonSchema = JsonSchema & { readonly oneOf?: readonly ComposedJsonSchema[] };
const copy = { headline: "자코모 프리미엄 소파", subcopy: "거실을 바꾸는 선택" } as const;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validPlan(overrides: Record<string, unknown> = {}): CreativeLayoutPlan {
  return {
    schemaVersion: "1.0.0",
    formatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
    source: "AGENT",
    background: { type: "SOLID", color: "#FFFFFF" },
    elements: [
      {
        id: "image-primary",
        type: "IMAGE",
        bounds: { x: 0.55, y: 0.08, width: 0.4, height: 0.84 },
        zIndex: 0,
        role: "PRIMARY_IMAGE",
        placement: {
          policy: "CENTER_CONTAIN",
          source: "AGENT",
          fitMode: "CONTAIN",
          anchor: "CENTER",
          subjectProtection: "REQUIRED",
        },
        assetId: "asset-primary",
      },
      {
        id: "headline",
        type: "TEXT",
        bounds: { x: 0.06, y: 0.16, width: 0.42, height: 0.2 },
        zIndex: 1,
        role: "HEADLINE",
        text: copy.headline,
        fontId: "SPOQA_HAN_SANS_BOLD",
        fontSizePx: 48,
        color: "#111111",
        lineHeightPx: 56,
        textAlign: "LEFT",
        verticalAlign: "TOP",
        wrapMode: "NO_WRAP",
        overflowMode: "ERROR",
      },
      {
        id: "subcopy",
        type: "TEXT",
        bounds: { x: 0.06, y: 0.42, width: 0.42, height: 0.16 },
        zIndex: 2,
        role: "SUBCOPY",
        text: copy.subcopy,
        fontId: "SPOQA_HAN_SANS_REGULAR",
        fontSizePx: 24,
        color: "#333333",
        lineHeightPx: 32,
        textAlign: "LEFT",
        verticalAlign: "TOP",
        wrapMode: "NO_WRAP",
        overflowMode: "ERROR",
      },
    ],
    ...overrides,
  } as CreativeLayoutPlan;
}

function selectedAsset(): FreeformPlannerSelectedAsset {
  const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6]);
  const checksumSha256 = sha256(bytes);
  const imageInput: AgentImageInput = {
    fileId: "asset-version-1",
    mimeType: "image/png",
    bytes,
    checksumSha256,
  };
  return {
    assetVersionId: "asset-version-1",
    rendererAssetId: "asset-primary",
    mimeType: "image/png",
    checksumSha256,
    width: 1200,
    height: 800,
    imageInput,
  };
}

function selectedAssetWithValidFixture(): FreeformPlannerSelectedAsset {
  const bytes = Uint8Array.from(
    readFileSync(
      path.join(runtimeRoot, "fixtures", "valid", "thumbnail-box-right__asset__basic__pass.png"),
    ),
  );
  const checksumSha256 = sha256(bytes);
  const imageInput: AgentImageInput = {
    fileId: "asset-version-1",
    mimeType: "image/png",
    bytes,
    checksumSha256,
  };
  return {
    assetVersionId: "asset-version-1",
    rendererAssetId: "asset-primary",
    mimeType: "image/png",
    checksumSha256,
    width: 1029,
    height: 258,
    imageInput,
  };
}

function plannerInput(): PlanFreeformLayoutInput {
  return {
    taskId: "task-freeform",
    workspaceId: "workspace-freeform",
    campaignId: "campaign-freeform",
    creativeId: "creative-freeform",
    productId: "product-freeform",
    targetProfile,
    confirmedCopy: copy,
    selectedAsset: selectedAsset(),
    messages: [{ role: "user", content: "return the canonical freeform plan" }],
  };
}

function countSchemaKeyword(value: unknown, keyword: string): number {
  if (Array.isArray(value))
    return value.reduce((count, child) => count + countSchemaKeyword(child, keyword), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (count, [key, child]) => count + (key === keyword ? 1 : 0) + countSchemaKeyword(child, keyword),
    0,
  );
}

function elementBranch(outputSchema: JsonSchema, type: string): JsonSchema {
  const items = outputSchema.properties?.elements?.items as
    | (JsonSchema & { readonly oneOf?: readonly JsonSchema[] })
    | undefined;
  const branch = items?.oneOf?.find((candidate) => candidate.properties?.type?.const === type);
  if (!branch) throw new Error(`missing ${type} branch`);
  return branch;
}

function resolverFixture(mutator: (schema: Record<string, unknown>) => void, omitLock = false) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "plume-pi3e13-resolver-"));
  const runtimeFixtureRoot = path.join(temporaryRoot, "upstream");
  const schemaDirectory = path.join(runtimeFixtureRoot, "packages/renderer-contract/schema");
  mkdirSync(schemaDirectory, { recursive: true });
  copyFileSync(
    path.join(runtimeRoot, "packages/renderer-contract/schema/creative-layout-plan-v1.schema.json"),
    path.join(schemaDirectory, "creative-layout-plan-v1.schema.json"),
  );
  const creativeElement = JSON.parse(
    readFileSync(
      path.join(runtimeRoot, "packages/renderer-contract/schema/creative-element-v1.schema.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  mutator(creativeElement);
  const creativeBytes = Buffer.from(JSON.stringify(creativeElement));
  writeFileSync(path.join(schemaDirectory, "creative-element-v1.schema.json"), creativeBytes);
  const lock = JSON.parse(
    readFileSync(path.join(runtimeRoot, "..", "SOURCE_LOCK.json"), "utf8"),
  ) as { files: Array<{ path: string; bytes: number; sha256: string }> };
  if (omitLock) {
    lock.files = lock.files.filter(
      (entry) => entry.path !== "packages/renderer-contract/schema/creative-element-v1.schema.json",
    );
  } else {
    const entry = lock.files.find(
      (candidate) =>
        candidate.path === "packages/renderer-contract/schema/creative-element-v1.schema.json",
    );
    if (!entry) throw new Error("test fixture lock entry missing");
    entry.bytes = creativeBytes.length;
    entry.sha256 = sha256(creativeBytes);
  }
  writeFileSync(path.join(temporaryRoot, "SOURCE_LOCK.json"), JSON.stringify(lock));
  return {
    runtimeRoot: runtimeFixtureRoot,
    cleanup: () => rmSync(temporaryRoot, { recursive: true, force: true }),
  };
}

function fakeOrchestrator(output: unknown) {
  const calls: AgentTaskInput[] = [];
  const orchestrator: AgentOrchestrator = {
    async run<T>(input: AgentTaskInput): Promise<AgentResult<T>> {
      calls.push(input);
      return {
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        agentCode: input.agentCode,
        status: "COMPLETED",
        output: output as T,
        metadata: {
          promptId: "layout_planner-system",
          promptVersion: "1.0.0",
          promptHash: "f".repeat(64),
          modelPolicyId: "vision-quality-v1",
          contextHash: "e".repeat(64),
          attempt: 1,
          latencyMs: 1,
        },
        stateTransitions: ["QUEUED", "RUNNING", "COMPLETED"],
      };
    },
  };
  return { calls, orchestrator };
}

describe("PI-3B FREEFORM LAYOUT_PLANNER handler", () => {
  it("keeps Stage A element geometry and materializes Stage B semantic crop into final placement", async () => {
    const calls: AgentTaskInput[] = [];
    const stageA = validPlan();
    const stageB = {
      formatProfileId: "kakao-moment-display-native-2-1-1200x600",
      semanticPlacement: {
        status: "FOUND",
        primarySubjectBounds: { x: 0.14, y: 0.14, width: 0.05, height: 0.05 },
        semanticRegion: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        focalPoint: { x: 0.165, y: 0.165 },
        confidence: 0.98,
      },
      rationale: "product geometry only",
    };
    const orchestrator: AgentOrchestrator = {
      async run<T>(input: AgentTaskInput): Promise<AgentResult<T>> {
        calls.push(input);
        return {
          taskId: input.taskId,
          workspaceId: input.workspaceId,
          agentCode: input.agentCode,
          status: "COMPLETED",
          output: (calls.length === 1 ? stageA : stageB) as T,
          metadata: {
            promptId: "layout_planner-system",
            promptVersion: "1.0.0",
            promptHash: "f".repeat(64),
            modelPolicyId: "vision-quality-v1",
            contextHash: "e".repeat(64),
            attempt: 1,
            latencyMs: 1,
          },
          stateTransitions: ["QUEUED", "RUNNING", "COMPLETED"],
        };
      },
    };
    const input = { ...plannerInput(), selectedAsset: selectedAssetWithValidFixture() };
    const result = await createFreeformLayoutPlannerHandler({
      orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    })(input);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.messages[0]?.content).toContain("exactly 3 elements");
    expect(calls[1]?.messages[0]?.content).toContain("FREEFORM semantic reintegration mode");
    expect(calls[1]?.data).toMatchObject({
      layoutMode: "FREEFORM",
      canvas: { width: 1200, height: 600 },
      targetImageElement: {
        id: "IMAGE_PRIMARY",
        role: "PRIMARY_IMAGE",
        pixelBounds: { width: 480, height: 504 },
      },
      formatProfile: {
        id: "kakao-moment-display-native-2-1-1200x600",
        rendererProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
      },
    });
    const finalPlan = result.agentResult.output;
    if (!finalPlan) throw new Error("final plan missing");
    const finalImage = finalPlan.elements.find(
      (element) => element.type === "IMAGE" && element.role === "PRIMARY_IMAGE",
    );
    if (!finalImage || finalImage.type !== "IMAGE") throw new Error("final image missing");
    expect(finalImage.placement.policy).toBe("SEMANTIC_CROP_COVER");
    expect(finalImage.placement.fitMode).toBe("COVER");
    expect(finalImage.placement.cropRect).toBeTruthy();
    expect(finalImage.placement.focalPoint).toEqual(stageB.semanticPlacement.focalPoint);
    expect(finalImage.placement.protectedSubjects).toEqual([
      {
        subjectId: "primary-product",
        subjectType: "PRODUCT",
        bounds: stageB.semanticPlacement.primarySubjectBounds,
      },
    ]);
    expect(finalImage.placement).not.toHaveProperty("cropCandidateId");
    expect(finalImage.placement).not.toHaveProperty("confidence");
    expect(finalImage.placement).not.toHaveProperty("rationale");
    expect(finalPlan.elements.filter((element) => element.type === "TEXT")).toEqual(
      stageA.elements.filter((element) => element.type === "TEXT"),
    );
  });

  it("calls the existing planner once with one image and the canonical schema identity", async () => {
    const fake = fakeOrchestrator(validPlan());
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    const result = await handler(plannerInput());
    expect(result.status).toBe("COMPLETED");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.agentCode).toBe("LAYOUT_PLANNER");
    expect(fake.calls[0]?.imageInputs).toHaveLength(1);
    expect(fake.calls[0]?.imageInputs?.[0]?.fileId).toBe("asset-version-1");
    const resolvedSchema = loadResolvedCanonicalCreativeLayoutPlanSchema(runtimeRoot) as JsonSchema;
    const outputSchema = fake.calls[0]?.outputSchema as ComposedJsonSchema;
    expect(outputSchema).not.toBe(schema);
    expect(canonicalJson(outputSchema)).not.toBe(canonicalJson(resolvedSchema));
    expect(outputSchema.properties?.elements?.minItems).toBe(3);
    expect(outputSchema.properties?.elements?.maxItems).toBe(3);
    expect(outputSchema.properties?.source?.enum).toEqual(["AGENT"]);
    expect(countSchemaKeyword(outputSchema, "$ref")).toBe(0);
    expect(countSchemaKeyword(outputSchema, "oneOf")).toBeGreaterThan(0);
    expect((outputSchema.properties?.background as ComposedJsonSchema)?.oneOf).toHaveLength(2);
    expect((outputSchema.properties?.elements?.items as ComposedJsonSchema)?.oneOf).toHaveLength(4);
    expect(
      ((outputSchema.properties?.elements?.items as ComposedJsonSchema)?.oneOf?.[0] as JsonSchema)
        .properties?.placement,
    ).toBeTruthy();
    const transportSchema = createStrictOutputAdapter({
      schemaId: "layout-plan.schema.json",
      domainSchema: outputSchema,
    }).transportSchema;
    expect(transportSchema.properties?.elements?.minItems).toBe(3);
    expect(transportSchema.properties?.elements?.maxItems).toBe(3);
    expect(transportSchema.properties?.source?.enum).toEqual(["AGENT"]);
    expect(countSchemaKeyword(transportSchema, "$ref")).toBe(0);
    expect(countSchemaKeyword(transportSchema, "oneOf")).toBe(0);
    expect((transportSchema.properties?.background as JsonSchema).anyOf).toHaveLength(2);
    expect(
      ((transportSchema.properties?.elements as JsonSchema).items as JsonSchema).anyOf,
    ).toHaveLength(4);
    const transportItems = (transportSchema.properties?.elements as JsonSchema).items as
      | (JsonSchema & { readonly anyOf?: readonly JsonSchema[] })
      | undefined;
    const transportTextBranch = transportItems?.anyOf?.find(
      (candidate) => candidate.properties?.type?.enum?.[0] === "TEXT",
    );
    expect(transportTextBranch?.properties?.fontId?.enum).toEqual([
      "SPOQA_HAN_SANS_BOLD",
      "SPOQA_HAN_SANS_REGULAR",
    ]);
    expect(transportTextBranch?.properties?.wrapMode?.enum).toEqual(["NO_WRAP"]);
    expect(transportTextBranch?.properties).not.toHaveProperty("opacity");
    expect(transportTextBranch?.properties).not.toHaveProperty("letterSpacingPx");
    expect(transportTextBranch?.required ?? []).not.toContain("opacity");
    expect(transportTextBranch?.required ?? []).not.toContain("letterSpacingPx");
    const transportImageBranch = transportItems?.anyOf?.find(
      (candidate) => candidate.properties?.type?.enum?.[0] === "IMAGE",
    );
    expect(transportImageBranch?.properties).not.toHaveProperty("opacity");
    expect(transportImageBranch?.required ?? []).not.toContain("opacity");
    const transportPlacement = transportImageBranch?.properties?.placement;
    expect(Object.keys(transportPlacement?.properties ?? {})).toEqual([
      "policy",
      "source",
      "fitMode",
      "anchor",
      "subjectProtection",
    ]);
    expect(transportPlacement?.additionalProperties).toBe(false);
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "For the HEADLINE TEXT element, fontId must be exactly SPOQA_HAN_SANS_BOLD.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "For the SUBCOPY TEXT element, fontId must be exactly SPOQA_HAN_SANS_REGULAR.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain("Use placement.policy CENTER_CONTAIN.");
    expect(fake.calls[0]?.messages[0]?.content).toContain("Use placement.source AGENT.");
    expect(fake.calls[0]?.messages[0]?.content).toContain("Use placement.fitMode CONTAIN.");
    expect(fake.calls[0]?.messages[0]?.content).toContain("Use placement.anchor CENTER.");
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "Use placement.subjectProtection REQUIRED.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "Do not provide cropRect, focalPoint, cropCandidateId, confidence, protectedSubjects, or rationale.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "For both the HEADLINE and SUBCOPY TEXT elements, wrapMode must be exactly NO_WRAP.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain("Do not use WORD_WRAP.");
    expect(fake.calls[0]?.messages[0]?.content).toContain("Do not use EXPLICIT_NEWLINES.");
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "Do not insert newline characters into either confirmed copy.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "Do not provide opacity on the PRIMARY_IMAGE, HEADLINE, or SUBCOPY elements.",
    );
    expect(fake.calls[0]?.messages[0]?.content).toContain(
      "Do not provide letterSpacingPx on the HEADLINE or SUBCOPY TEXT elements.",
    );

    const textBranch = elementBranch(outputSchema, "TEXT");
    expect(textBranch.properties?.fontId?.enum).toEqual([
      "SPOQA_HAN_SANS_BOLD",
      "SPOQA_HAN_SANS_REGULAR",
    ]);
    expect(textBranch.properties?.wrapMode?.enum).toEqual(["NO_WRAP"]);
    expect(textBranch.properties).not.toHaveProperty("opacity");
    expect(textBranch.properties).not.toHaveProperty("letterSpacingPx");
    expect(textBranch.required ?? []).not.toContain("opacity");
    expect(textBranch.required ?? []).not.toContain("letterSpacingPx");
    const imageBranch = elementBranch(outputSchema, "IMAGE");
    expect(imageBranch.properties).not.toHaveProperty("opacity");
    expect(imageBranch.required ?? []).not.toContain("opacity");
    const placement = imageBranch.properties?.placement as JsonSchema;
    expect(Object.keys(placement.properties ?? {})).toEqual([
      "policy",
      "source",
      "fitMode",
      "anchor",
      "subjectProtection",
    ]);
    expect(placement.additionalProperties).toBe(false);
    expect(placement.properties?.policy?.enum).toEqual(["CENTER_CONTAIN"]);
    expect(placement.properties?.source?.enum).toEqual(["AGENT"]);
    expect(placement.properties?.fitMode?.enum).toEqual(["CONTAIN"]);
    expect(placement.properties?.anchor?.enum).toEqual(["CENTER"]);
    expect(placement.properties?.subjectProtection?.enum).toEqual(["REQUIRED"]);
    expect(placement.properties).not.toHaveProperty("cropRect");
    expect(placement.properties).not.toHaveProperty("focalPoint");
    expect(placement.properties).not.toHaveProperty("cropCandidateId");
    expect(placement.properties).not.toHaveProperty("confidence");
    expect(placement.properties).not.toHaveProperty("protectedSubjects");
    expect(placement.properties).not.toHaveProperty("rationale");

    expect(fake.calls[0]?.data).toMatchObject({
      campaignId: "campaign-freeform",
      creativeId: "creative-freeform",
      productId: "product-freeform",
      assets: [
        {
          assetVersionId: "asset-version-1",
          rendererAssetId: "asset-primary",
          mimeType: "image/png",
          checksumSha256: sha256(Uint8Array.from([1, 2, 3, 4, 5, 6])),
          width: 1200,
          height: 800,
        },
      ],
      copy,
      formatProfile: { id: targetProfile.formatProfileId },
      confirmedCopy: copy,
    });
    expect(fake.calls[0]?.data).not.toHaveProperty("template");
    expect(fake.calls[0]?.messages).toHaveLength(1);
    expect(fake.calls[0]?.messages[0]?.role).toBe("user");
    expect(fake.calls[0]?.messages[0]?.content).toContain("exactly 3 elements");
    expect(fake.calls[0]?.messages[0]?.content).toContain("exactly 1 IMAGE");
    expect(fake.calls[0]?.messages[0]?.content).toContain("PRIMARY_IMAGE");
    expect(fake.calls[0]?.messages[0]?.content).toContain("asset-primary");
    expect(fake.calls[0]?.messages[0]?.content).toContain(copy.headline);
    expect(fake.calls[0]?.messages[0]?.content).toContain(copy.subcopy);
    expect(fake.calls[0]?.messages[0]?.content).toContain("x + width <= 1");
  });

  it("aligns the planner context and reinjects the derived format profile through the real orchestrator", async () => {
    const capture = fakeOrchestrator(validPlan());
    const captureHandler = createFreeformLayoutPlannerHandler({
      orchestrator: capture.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await captureHandler(plannerInput());
    const taskData = capture.calls[0]?.data;
    if (!taskData) throw new Error("planner task data was not captured");
    const context = buildAgentContext({
      agentCode: "LAYOUT_PLANNER",
      workspaceId: "workspace-freeform",
      subjectType: "CAMPAIGN",
      subjectId: "creative-freeform",
      data: taskData,
    });
    expect(context.data.assets).toEqual([
      {
        assetVersionId: "asset-version-1",
        rendererAssetId: "asset-primary",
        mimeType: "image/png",
        checksumSha256: sha256(Uint8Array.from([1, 2, 3, 4, 5, 6])),
        width: 1200,
        height: 800,
      },
    ]);
    expect(context.data.copy).toEqual(copy);
    expect(context.data.formatProfile).toEqual({ id: targetProfile.formatProfileId });
    expect(context.data).not.toHaveProperty("targetProfile");

    const { formatProfileId: _omittedFormatProfileId, ...providerOutput } = validPlan();
    const adapter = createStrictOutputAdapter<CreativeLayoutPlan>({
      schemaId: "layout-plan.schema.json",
      domainSchema: loadResolvedCanonicalCreativeLayoutPlanSchema(runtimeRoot) as JsonSchema,
      context: context.data,
    });
    const decoded = adapter.decode(providerOutput);
    expect(decoded.valid).toBe(true);
    if (!decoded.valid) throw new Error("expected derived format profile injection to validate");
    expect(decoded.value.formatProfileId).toBe(targetProfile.formatProfileId);

    let gatewayCalls = 0;
    let capturedMessages: AgentTaskInput["messages"] = [];
    let capturedSchema: JsonSchema | undefined;
    const gateway: AgentProviderGateway = {
      async execute(request) {
        gatewayCalls += 1;
        capturedMessages = request.messages;
        capturedSchema = request.outputSchema;
        return {
          status: "COMPLETED" as const,
          outputJson: providerOutput,
          model: "gpt-5.6-luna",
          latencyMs: 1,
          httpStatus: 200,
          evidence: {
            requestAttempted: true,
            responseReceived: true,
            httpStatus: 200,
            resolvedModel: "gpt-5.6-luna",
            jsonParseStatus: "PASS" as const,
          },
        };
      },
    };
    const orchestrator = createAgentOrchestrator({
      gateway,
      retryEnabled: false,
      repairEnabled: false,
    });
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    const result = await handler(plannerInput());
    expect(result.status).toBe("COMPLETED");
    expect(result.agentResult.status).toBe("COMPLETED");
    expect(result.agentResult.output?.formatProfileId).toBe(targetProfile.formatProfileId);
    expect(gatewayCalls).toBe(1);
    expect(capturedMessages).toHaveLength(1);
    expect(capturedMessages[0]?.role).toBe("user");
    expect(capturedMessages[0]?.content).toContain(
      "Do not rewrite, paraphrase, shorten, or replace confirmed copy.",
    );
    expect(capturedSchema?.properties?.elements?.minItems).toBe(3);
    expect(capturedSchema?.properties?.elements?.maxItems).toBe(3);
    expect(capturedSchema?.properties?.source?.enum).toEqual(["AGENT"]);
    expect(countSchemaKeyword(capturedSchema, "$ref")).toBe(0);
    expect(countSchemaKeyword(capturedSchema, "oneOf")).toBe(0);
  });

  it("rejects the previous image-only shape without weakening the first-proof contract", async () => {
    const fake = fakeOrchestrator({ ...validPlan(), elements: [validPlan().elements[0]] });
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await expect(handler(plannerInput())).rejects.toThrow(
      "FREEFORM_FIRST_PROOF_ELEMENT_COUNT_INVALID",
    );
    expect(fake.calls).toHaveLength(1);
  });

  it.each([
    ["wrong format", validPlan({ formatProfileId: "WRONG" })],
    ["legacy pixel layout", { formatProfileId: "WRONG", templateId: null, elements: [] }],
    [
      "changed copy",
      validPlan({
        elements: validPlan().elements.map((element) =>
          element.id === "headline" ? { ...element, text: "변경" } : element,
        ),
      }),
    ],
    [
      "extra logo",
      validPlan({
        elements: [
          ...validPlan().elements,
          { ...validPlan().elements[0], id: "logo", type: "LOGO" },
        ],
      }),
    ],
    [
      "extra shape",
      validPlan({
        elements: [
          ...validPlan().elements,
          {
            ...validPlan().elements[0],
            id: "shape",
            type: "SHAPE",
            shape: "RECTANGLE",
            fillColor: "#FFFFFF",
          },
        ],
      }),
    ],
    [
      "two images",
      validPlan({
        elements: [
          ...validPlan().elements,
          { ...validPlan().elements[0], id: "image-secondary", assetId: "asset-secondary" },
        ],
      }),
    ],
    ["transparent background", validPlan({ background: { type: "TRANSPARENT" } })],
    [
      "wrong asset",
      validPlan({
        elements: validPlan().elements.map((element) =>
          element.type === "IMAGE" ? { ...element, assetId: "asset-other" } : element,
        ),
      }),
    ],
  ] as const)("rejects %s from the first-proof contract", async (_name, output) => {
    const fake = fakeOrchestrator(output);
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await expect(handler(plannerInput())).rejects.toThrow();
    expect(fake.calls).toHaveLength(1);
  });

  it("rejects image metadata drift before an orchestrator call", async () => {
    const fake = fakeOrchestrator(validPlan());
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    const input = plannerInput();
    const drifted = {
      ...input,
      selectedAsset: { ...input.selectedAsset, checksumSha256: "0".repeat(64) },
    };
    await expect(handler(drifted)).rejects.toThrow(
      "FREEFORM_PLANNER_IMAGE_INPUT_CHECKSUM_MISMATCH",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("does not repair an invalid font or placement after the provider returns", async () => {
    const invalid = validPlan({
      elements: validPlan().elements.map((element) => {
        if (element.type === "IMAGE") {
          return {
            ...element,
            placement: { ...element.placement, cropRect: { x: 0, y: 0, width: 1, height: 1 } },
          };
        }
        if (element.role === "HEADLINE") return { ...element, fontId: "UNREGISTERED_FONT" };
        return element;
      }),
    });
    const fake = fakeOrchestrator(invalid);
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await expect(handler(plannerInput())).rejects.toThrow();
    expect(fake.calls).toHaveLength(1);
  });

  it("does not post-hoc remove optional element fields from provider output", async () => {
    const invalid = validPlan({
      elements: validPlan().elements.map((element) =>
        element.type === "IMAGE"
          ? { ...element, opacity: "invalid-opacity" }
          : { ...element, opacity: "invalid-opacity", letterSpacingPx: "invalid-letter-spacing" },
      ),
    });
    const fake = fakeOrchestrator(invalid);
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: schema,
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await expect(handler(plannerInput())).rejects.toThrow();
    expect(fake.calls).toHaveLength(1);
    expect((invalid.elements[0] as Record<string, unknown>).opacity).toBe("invalid-opacity");
    expect((invalid.elements[1] as Record<string, unknown>).opacity).toBe("invalid-opacity");
    expect((invalid.elements[1] as Record<string, unknown>).letterSpacingPx).toBe(
      "invalid-letter-spacing",
    );
    expect((invalid.elements[2] as Record<string, unknown>).opacity).toBe("invalid-opacity");
    expect((invalid.elements[2] as Record<string, unknown>).letterSpacingPx).toBe(
      "invalid-letter-spacing",
    );
  });

  it.each([
    [
      "WORD_WRAP",
      validPlan({
        elements: validPlan().elements.map((element) =>
          element.type === "TEXT" ? { ...element, wrapMode: "WORD_WRAP" } : element,
        ),
      }),
    ],
    [
      "newline",
      validPlan({
        elements: validPlan().elements.map((element) =>
          element.type === "TEXT" && element.role === "HEADLINE"
            ? { ...element, text: `${element.text}\n삽입` }
            : element,
        ),
      }),
    ],
  ] as const)(
    "does not repair %s text semantics after the provider returns",
    async (_name, output) => {
      const fake = fakeOrchestrator(output);
      const handler = createFreeformLayoutPlannerHandler({
        orchestrator: fake.orchestrator,
        outputSchema: schema,
        rendererRuntimeRoot: runtimeRoot,
        fontRegistry,
      });
      await expect(handler(plannerInput())).rejects.toThrow();
      expect(fake.calls).toHaveLength(1);
    },
  );

  it("rejects a non-canonical schema dependency before an orchestrator call", async () => {
    const fake = fakeOrchestrator(validPlan());
    const handler = createFreeformLayoutPlannerHandler({
      orchestrator: fake.orchestrator,
      outputSchema: { type: "object" },
      rendererRuntimeRoot: runtimeRoot,
      fontRegistry,
    });
    await expect(handler(plannerInput())).rejects.toThrow(
      "FREEFORM_PLANNER_OUTPUT_SCHEMA_NOT_CANONICAL",
    );
    expect(fake.calls).toHaveLength(0);
    expect(canonicalJson(schema)).not.toBe(canonicalJson({ type: "object" }));
  });

  it("fails closed for an unsupported external reference origin", () => {
    const fixture = resolverFixture((creativeElement) => {
      creativeElement.oneOf = [{ $ref: "https://evil.example/schema/creative-element.json" }];
    });
    try {
      expect(() => loadResolvedCanonicalCreativeLayoutPlanSchema(fixture.runtimeRoot)).toThrow(
        "FREEFORM_CANONICAL_SCHEMA_REF_UNSUPPORTED",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed when an external schema has no SOURCE_LOCK entry", () => {
    const fixture = resolverFixture(() => undefined, true);
    try {
      expect(() => loadResolvedCanonicalCreativeLayoutPlanSchema(fixture.runtimeRoot)).toThrow(
        "FREEFORM_CANONICAL_SOURCE_LOCK_ENTRY_MISSING",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed on a synthetic external reference cycle", () => {
    const fixture = resolverFixture((creativeElement) => {
      creativeElement.oneOf = [
        { $ref: "https://kbr.local/schema/creative-element-v1.schema.json" },
      ];
    });
    try {
      expect(() => loadResolvedCanonicalCreativeLayoutPlanSchema(fixture.runtimeRoot)).toThrow(
        "FREEFORM_CANONICAL_SCHEMA_REF_CYCLE",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
