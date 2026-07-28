import { describe, expect, it } from "vitest";
import { applyEditOperations, EditOperationError } from "./apply-edit-operations.js";
import type { CreativeDocument } from "./creative-document.js";

const document: CreativeDocument = {
  schemaVersion: "1.0.0",
  formatProfileId: "profile-1",
  canvas: { width: 300, height: 200, colorMode: "RGB", transparentBackground: true },
  elements: [
    {
      id: "headline",
      type: "TEXT",
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      zIndex: 1,
      locked: false,
      visible: true,
      text: "Old",
    },
    {
      id: "logo",
      type: "LOGO",
      x: 200,
      y: 10,
      width: 50,
      height: 50,
      zIndex: 2,
      locked: true,
      visible: true,
      assetVersionId: "asset-1",
    },
  ],
  usedAssetVersionIds: ["asset-1"],
  copyAssets: {},
  metadata: {
    workspaceId: "workspace-1",
    campaignId: "campaign-1",
    creativeId: "creative-1",
    productId: null,
  },
};

describe("applyEditOperations", () => {
  it("applies a valid batch and recalculates used assets", () => {
    const result = applyEditOperations(document, {
      operations: [
        {
          operationId: "move",
          action: "MOVE",
          targetIds: ["headline"],
          payload: { deltaX: 5, deltaY: 8 },
        },
        {
          operationId: "copy",
          action: "UPDATE_TEXT",
          targetIds: ["headline"],
          payload: { text: "New" },
        },
        {
          operationId: "add",
          action: "ADD",
          targetIds: ["shape"],
          payload: {
            element: {
              id: "shape",
              type: "SHAPE",
              x: 10,
              y: 80,
              width: 40,
              height: 20,
              zIndex: 3,
              locked: false,
              visible: true,
            },
          },
        },
      ],
    });
    expect(result.elements.find((element) => element.id === "headline")?.text).toBe("New");
    expect(result.elements).toHaveLength(3);
    expect(result.usedAssetVersionIds).toEqual(["asset-1"]);
  });

  it("rejects locked targets and leaves the original document unchanged on a later failure", () => {
    expect(() =>
      applyEditOperations(document, {
        operations: [
          {
            operationId: "locked",
            action: "MOVE",
            targetIds: ["logo"],
            payload: { deltaX: 1, deltaY: 1 },
          },
        ],
      }),
    ).toThrow(EditOperationError);
    expect(document.elements[0].x).toBe(10);
    expect(() =>
      applyEditOperations(document, {
        operations: [
          {
            operationId: "first",
            action: "MOVE",
            targetIds: ["headline"],
            payload: { deltaX: 5, deltaY: 0 },
          },
          { operationId: "missing", action: "DELETE", targetIds: ["unknown"], payload: {} },
        ],
      }),
    ).toThrow("Target element not found");
    expect(document.elements[0].x).toBe(10);
  });
});
