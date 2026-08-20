import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectImageBytes } from "@plume/renderer-vendor";
import { planSemanticPlacement } from "./semantic-placement-planner.js";

const fixturePath = new URL(
  "../../../renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__basic__pass.png",
  import.meta.url,
);
const jpegFixturePath = new URL(
  "../../../renderer-vendor/upstream/fixtures/valid/thumbnail-box-right__asset__jpeg__pass.jpg",
  import.meta.url,
);

async function asset() {
  const bytes = new Uint8Array(await readFile(fixturePath));
  return {
    assetId: "semantic-asset",
    fileId: "file-semantic-asset",
    mimeType: "image/png" as const,
    bytes,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function request(input: Awaited<ReturnType<typeof asset>>) {
  return {
    taskId: "semantic-task",
    workspaceId: "workspace-1",
    correlationId: "semantic-correlation",
    creativeId: "creative-1",
    productId: "product-1",
    asset: input,
  };
}

describe("semantic placement planner", () => {
  it("runs the real orchestrator boundary and builds one candidate plus an accepted plan", async () => {
    const input = await asset();
    let providerCalls = 0;
    const result = await planSemanticPlacement(request(input), {
      gateway: {
        execute: async (providerRequest) => {
          providerCalls += 1;
          expect(providerRequest.imageInputs).toHaveLength(1);
          expect(providerRequest.imageInputs[0]).toMatchObject({
            fileId: input.fileId,
            detail: "high",
          });
          expect(
            providerRequest.messages.map((message) => message.content).join(" "),
          ).not.toContain(Buffer.from(input.bytes).toString("base64"));
          return {
            status: "COMPLETED",
            outputJson: {
              semanticPlacement: {
                status: "FOUND",
                primarySubjectBounds: { x: 0.25, y: 0.2, width: 0.3, height: 0.3 },
                semanticRegion: { x: 0.1, y: 0.1, width: 0.6, height: 0.4 },
                focalPoint: { x: 0.4, y: 0.35 },
                confidence: 0.95,
              },
              rationale: "synthetic semantic placement",
            },
            latencyMs: 1,
          };
        },
      },
    });
    expect(providerCalls).toBe(1);
    expect(result.imageMetadata.detectedMimeType).toBe("image/png");
    expect(result.candidate).toMatchObject({
      imageSlotId: "IMAGE_PRIMARY",
      preservedSubjectIds: ["primary-product"],
      clippedSubjectIds: [],
      fillRatio: 1,
      subjectCoverageRatio: 1,
    });
    expect(result.acceptedPlan).toMatchObject({
      schemaVersion: "1.8.0",
      imageSlotId: "IMAGE_PRIMARY",
      policy: "SEMANTIC_CROP_COVER",
      source: "AGENT",
      fitMode: "COVER",
      anchor: "CENTER",
      subjectProtection: "REQUIRED",
      cropCandidateId: result.candidate.candidateId,
    });
    expect(result.acceptedPlan.cropRect).toBeUndefined();
    expect(result.acceptedPlan.protectedSubjects).toEqual([
      expect.objectContaining({ subjectId: "primary-product", subjectType: "PRODUCT" }),
    ]);
  });

  it("uses the frozen image inspection surface for JPEG metadata", async () => {
    const bytes = new Uint8Array(await readFile(jpegFixturePath));
    const metadata = await inspectImageBytes(bytes);
    expect(metadata.detectedMimeType).toBe("image/jpeg");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
    expect(metadata.exifOrientation).toBeGreaterThanOrEqual(1);
    expect(metadata.exifOrientation).toBeLessThanOrEqual(8);
    expect(metadata.hasAlpha).toBe(false);
  });

  it("fails closed on NOT_FOUND without producing a candidate or plan", async () => {
    const input = await asset();
    let providerCalls = 0;
    await expect(
      planSemanticPlacement(request(input), {
        gateway: {
          execute: async () => {
            providerCalls += 1;
            return {
              status: "COMPLETED",
              outputJson: {
                semanticPlacement: {
                  status: "NOT_FOUND",
                  primarySubjectBounds: null,
                  semanticRegion: null,
                  focalPoint: null,
                  confidence: 0,
                },
                rationale: "No product identified",
              },
              latencyMs: 1,
            };
          },
        },
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_SUBJECT_NOT_FOUND" });
    expect(providerCalls).toBe(1);
  });

  it("rejects an image declared with the wrong MIME", async () => {
    const input = await asset();
    await expect(
      planSemanticPlacement(request({ ...input, mimeType: "image/jpeg" }), {
        gateway: { execute: async () => ({ status: "COMPLETED", outputJson: {}, latencyMs: 1 }) },
      }),
    ).rejects.toMatchObject({ code: "SEMANTIC_IMAGE_MIME_MISMATCH" });
  });

  it("requires exactly one selected image", async () => {
    await expect(
      planSemanticPlacement(
        {
          taskId: "semantic-task",
          workspaceId: "workspace-1",
          correlationId: "semantic-correlation",
          creativeId: "creative-1",
          productId: "product-1",
          assets: [],
        },
        {
          gateway: { execute: async () => ({ status: "COMPLETED", outputJson: {}, latencyMs: 1 }) },
        },
      ),
    ).rejects.toMatchObject({ code: "SEMANTIC_IMAGE_INPUT_REQUIRED" });
    const input = await asset();
    await expect(
      planSemanticPlacement(
        {
          ...request(input),
          assets: [
            input,
            { ...input, assetId: "semantic-asset-2", fileId: "file-semantic-asset-2" },
          ],
        },
        {
          gateway: { execute: async () => ({ status: "COMPLETED", outputJson: {}, latencyMs: 1 }) },
        },
      ),
    ).rejects.toMatchObject({ code: "SEMANTIC_IMAGE_CARDINALITY_INVALID" });
  });
});
