import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreativeGalleryScreen } from "./creative-gallery-screen.js";

describe("CREATIVE-01 creative gallery snapshot contract", () => {
  it("filters by product, format, and status while preserving stateful actions", () => {
    const html = renderToStaticMarkup(
      createElement(CreativeGalleryScreen, {
        creatives: [
          {
            id: "creative-1",
            productId: "product-1",
            productName: "Product One",
            formatId: "square",
            formatLabel: "Square 1:1",
            status: "ready",
          },
          {
            id: "creative-2",
            productId: "product-2",
            productName: "Product Two",
            formatId: "story",
            formatLabel: "Story 9:16",
            status: "approved",
          },
        ],
        filters: { productId: "product-1", formatId: "square", status: "ready" },
        onEdit: () => undefined,
        onValidate: () => undefined,
      }),
    );

    const snapshot = {
      screenId: html.match(/data-screen-id="([^"]+)"/)?.[1],
      creativeIds: [...html.matchAll(/data-creative-id="([^"]+)"/g)].map((match) => match[1]),
      hasProductFilter: html.includes('data-filter-group="product"'),
      hasFormatFilter: html.includes('data-filter-group="format"'),
      hasStatusFilter: html.includes('data-filter-group="status"'),
      hasEditAction: html.includes('data-creative-action="edit"'),
      hasValidateAction: html.includes('data-creative-action="validate"'),
    };

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "creativeIds": [
          "creative-1",
        ],
        "hasEditAction": true,
        "hasFormatFilter": true,
        "hasProductFilter": true,
        "hasStatusFilter": true,
        "hasValidateAction": true,
        "screenId": "CREATIVE-01",
      }
    `);
  });

  it("locks edit and validate actions for approved results", () => {
    const html = renderToStaticMarkup(
      createElement(CreativeGalleryScreen, {
        creatives: [
          {
            id: "creative-approved",
            productId: "product-1",
            productName: "Product One",
            formatId: "square",
            formatLabel: "Square 1:1",
            status: "approved",
          },
        ],
        onEdit: () => undefined,
        onValidate: () => undefined,
      }),
    );

    expect(html).toContain('data-creative-status="approved"');
    expect(html).toContain("Approved creatives are locked.");
    expect(html).toContain("This creative has already been validated.");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });
});
