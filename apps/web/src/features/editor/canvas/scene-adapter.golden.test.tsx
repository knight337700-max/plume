import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SceneAdapter,
  type CreativeDocument,
} from "./scene-adapter.js";
import {
  createSelectionModel,
  getSelectionHandleIds,
  selectElement,
} from "./selection-model.js";

const documentFixture: CreativeDocument = {
  id: "document-1",
  width: 1200,
  height: 800,
  backgroundColor: "#ffffff",
  elements: [
    {
      id: "image-1",
      type: "image",
      bounds: { x: 0, y: 0, width: 1200, height: 500 },
      src: "hero.jpg",
      alt: "Hero product",
    },
    {
      id: "text-1",
      type: "text",
      bounds: { x: 80, y: 540, width: 520, height: 80 },
      text: "Summer sale",
      fontSize: 48,
      color: "#111827",
    },
    {
      id: "logo-1",
      type: "logo",
      bounds: { x: 960, y: 40, width: 160, height: 80 },
      src: "logo.svg",
      alt: "Brand logo",
    },
    {
      id: "shape-1",
      type: "shape",
      shape: "rectangle",
      bounds: { x: 60, y: 650, width: 1080, height: 8 },
      fill: "#2563eb",
    },
  ],
};

describe("canvas scene adapter golden fixture", () => {
  it("renders all supported elements and matching selection handles", () => {
    const selection = selectElement(
      createSelectionModel(["image-1", "text-1", "logo-1", "shape-1"], ["logo-1"]),
      "text-1",
      "add",
    );
    const html = renderToStaticMarkup(
      createElement(SceneAdapter, {
        document: documentFixture,
        selectedIds: selection.selectedIds,
      }),
    );
    const snapshot = {
      documentId: html.match(/data-scene-document-id="([^"]+)"/)?.[1],
      elementIds: [...html.matchAll(/data-scene-element-id="([^"]+)"/g)].map((match) => match[1]),
      elementTypes: [...html.matchAll(/data-scene-element-type="([^"]+)"/g)].map((match) => match[1]),
      handleIds: [...html.matchAll(/data-selection-handle-for="([^"]+)"/g)].map((match) => match[1]),
    };

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "documentId": "document-1",
        "elementIds": [
          "image-1",
          "text-1",
          "logo-1",
          "shape-1",
        ],
        "elementTypes": [
          "image",
          "text",
          "logo",
          "shape",
        ],
        "handleIds": [
          "logo-1",
          "text-1",
        ],
      }
    `);
    expect(html).toContain('src="hero.jpg"');
    expect(html).toContain('src="logo.svg"');
    expect(html).toContain("Summer sale");
    expect(html).toContain("#2563eb");
  });

  it("drops unknown selection IDs before exposing handles", () => {
    const model = createSelectionModel(["image-1", "text-1"], ["missing", "text-1"]);
    expect(getSelectionHandleIds(model)).toEqual(["text-1"]);
  });
});
