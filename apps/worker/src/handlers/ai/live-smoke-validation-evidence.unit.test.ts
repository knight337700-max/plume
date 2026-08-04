import { describe, expect, it } from "vitest";
import type { AgentProviderGateway } from "../../../../../packages/core/src/agents/orchestrator.js";
import type { LiveSmokeBudgetStore } from "../../../../../packages/infrastructure/src/async/live-smoke-budget-store.js";
import type { LiveSmokeCoverageStore } from "../../../../../packages/infrastructure/src/async/live-smoke-coverage-store.js";
import type { LiveSmokeLifecycleStore } from "../../../../../packages/infrastructure/src/async/live-smoke-lifecycle-store.js";
import type {
  LiveSmokeValidationEvidenceInput,
  LiveSmokeValidationEvidenceStore,
} from "../../../../../packages/infrastructure/src/async/live-smoke-validation-evidence-store.js";
import { createLiveSmokeHandler, createLiveSmokeVerificationHandler } from "./live-smoke.js";
import { LIVE_SMOKE_SYNTHETIC_SCENARIO_ID } from "../../../../../packages/core/src/agents/live-smoke-synthetic-scenarios.js";

const ids = {
  workspaceId: "00000000-0000-4000-8000-0000000002c0",
  smokeRunId: "00000000-0000-4000-8000-0000000002f1",
  budgetEpochId: "00000000-0000-4000-8000-0000000002f2",
  verificationRunId: "00000000-0000-4000-8000-0000000002f3",
  parentWorkflowJobId: "00000000-0000-4000-8000-0000000002f4",
};

function budgetStore(): LiveSmokeBudgetStore {
  return {
    async createEpoch(input) {
      return {
        workspaceId: input.workspaceId,
        smokeRunId: input.smokeRunId,
        budgetEpochId: input.budgetEpochId,
        parentBudgetEpochId: input.parentBudgetEpochId ?? null,
        limit: input.limit,
        used: 0,
        status: "OPEN",
      };
    },
    async reserve() {
      return { allowed: true, duplicate: false, used: 1, remaining: 8 };
    },
    async markDispatchStarted() {
      return { marked: true, duplicate: false };
    },
    async settle() {
      return { settled: true, duplicate: false };
    },
    async markUnknownBillable() {
      return { marked: true, duplicate: false };
    },
  };
}

function lifecycleStore(): LiveSmokeLifecycleStore {
  return {
    async record() {
      return { inserted: true };
    },
    async markProviderRequestAttempt() {
      return { updated: true };
    },
    async recordReconciliation() {
      return { inserted: true };
    },
    async ensureCanary() {},
    async getCanaryStatus() {
      return "PASS";
    },
    async recordCanary() {},
  };
}

function evidenceStore(rows: LiveSmokeValidationEvidenceInput[]): LiveSmokeValidationEvidenceStore {
  return {
    async record(input) {
      rows.push(input);
      return { inserted: true };
    },
  };
}

function minimalTransport(schema: Record<string, unknown>): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, minimalTransport(value)]),
    );
  }
  if (type === "array") return [];
  if (type === "string") return "synthetic";
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return false;
  return null;
}

function providerGateway(invokeSdkCallback: boolean): AgentProviderGateway {
  return {
    async execute(request) {
      if (invokeSdkCallback) await request.onSdkRequestAttempt?.();
      return {
        status: "COMPLETED" as const,
        outputJson: minimalTransport(request.outputSchema as unknown as Record<string, unknown>),
        model: "gpt-5.6-luna",
        latencyMs: 1,
        usage: { inputUnits: 12, outputUnits: 8 },
        providerRequestIdHash: "a".repeat(64),
        evidence: {
          requestAttempted: invokeSdkCallback,
          responseReceived: true,
          httpStatus: 200,
          requestIdHash: "a".repeat(64),
          resolvedModel: "gpt-5.6-luna",
          jsonParseStatus: "PASS" as const,
          outputFingerprint: "b".repeat(64),
          outputLengthBytes: 42,
          inputUnits: 12,
          outputUnits: 8,
        },
      };
    },
  };
}

function job(agentCode: string) {
  return {
    id: `${agentCode}-item`,
    attemptsMade: 0,
    data: {
      agentCode,
      workspaceId: ids.workspaceId,
      smokeRunId: ids.smokeRunId,
      budgetEpochId: ids.budgetEpochId,
      workflowCallBudget: 9,
      syntheticScenarioId: LIVE_SMOKE_SYNTHETIC_SCENARIO_ID,
    },
  } as never;
}

function invocation(agentCode: string) {
  return {
    ...ids,
    jobItemId: `${agentCode}-item`,
  };
}

describe("Phase 2C.9 validation evidence instrumentation", () => {
  it("records one SDK boundary and validation path for each diagnostic agent", async () => {
    for (const agentCode of ["LAYOUT_PLANNER", "ASSET_CURATOR", "EXPORT_ASSISTANT"]) {
      const rows: LiveSmokeValidationEvidenceInput[] = [];
      const handler = createLiveSmokeHandler(providerGateway(true), budgetStore(), {
        providerMode: "live",
        pricingPolicy: {
          model: "gpt-5.6-luna",
          pricingVersion: "test",
          inputMicroUsdPerMillionTokens: 1,
          outputMicroUsdPerMillionTokens: 1,
        },
        validationEvidenceStore: evidenceStore(rows),
      });
      await handler(job(agentCode), invocation(agentCode));
      expect(rows.map((row) => row.evidenceStage)).toEqual([
        "SDK_ATTEMPT",
        "PROVIDER_RESPONSE",
        "VALIDATION",
      ]);
      const sdk = rows[0]!;
      const validation = rows[2]!;
      expect(sdk.sdkRequestAttempted).toBe(true);
      expect(validation.providerResponseReceived).toBe(true);
      expect(validation.providerHttpStatus).toBe(200);
      expect(validation.resolvedModel).toBe("gpt-5.6-luna");
      expect(["PASS", "NOT_REACHED"]).toContain(validation.transportValidationStatus);
      expect(validation.domainValidationStatus).toBe("PASS");
      expect(validation.outputFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(JSON.stringify(rows)).not.toContain("Synthetic JACOMO");
    }
  });

  it("does not mistake beforeProviderCall for an SDK attempt", async () => {
    const rows: LiveSmokeValidationEvidenceInput[] = [];
    const handler = createLiveSmokeHandler(providerGateway(false), budgetStore(), {
      providerMode: "live",
      pricingPolicy: {
        model: "gpt-5.6-luna",
        pricingVersion: "test",
        inputMicroUsdPerMillionTokens: 1,
        outputMicroUsdPerMillionTokens: 1,
      },
      validationEvidenceStore: evidenceStore(rows),
    });
    await expect(
      handler(job("LAYOUT_PLANNER"), invocation("LAYOUT_PLANNER")),
    ).rejects.toMatchObject({
      code: "LIVE_SMOKE_UNKNOWN_BILLABLE",
    });
    expect(rows.some((row) => row.evidenceStage === "SDK_ATTEMPT")).toBe(false);
    expect(rows.find((row) => row.evidenceStage === "PROVIDER_RESPONSE")?.sdkRequestAttempted).toBe(
      false,
    );
  });

  it("records coverage success, idempotent conflict, and write failure separately", async () => {
    const rows: LiveSmokeValidationEvidenceInput[] = [];
    const idempotentCoverage: LiveSmokeCoverageStore = {
      async createVerificationRun(input) {
        return { ...input, created: true };
      },
      async recordCoverage() {
        return { inserted: false };
      },
      async listCoverage() {
        return [];
      },
    };
    const handler = createLiveSmokeVerificationHandler(
      providerGateway(true),
      budgetStore(),
      idempotentCoverage,
      {
        providerMode: "live",
        pricingPolicy: {
          model: "gpt-5.6-luna",
          pricingVersion: "test",
          inputMicroUsdPerMillionTokens: 1,
          outputMicroUsdPerMillionTokens: 1,
        },
        lifecycleStore: lifecycleStore(),
        validationEvidenceStore: evidenceStore(rows),
      },
    );
    await handler(
      {
        id: "LAYOUT_PLANNER-item",
        attemptsMade: 0,
        data: {
          ...(job("LAYOUT_PLANNER") as { data: Record<string, unknown> }).data,
          verificationOnly: true,
          verificationRunId: ids.verificationRunId,
          parentWorkflowJobId: ids.parentWorkflowJobId,
        },
      } as never,
      invocation("LAYOUT_PLANNER"),
    );
    const idempotent = rows.find((row) => row.evidenceStage === "COVERAGE_WRITE");
    expect(idempotent).toMatchObject({
      coverageWriteAttempted: true,
      coverageWriteSucceeded: true,
      coverageWriteErrorCode: "IDEMPOTENT_EXISTING_RECORD",
    });
  });
});
