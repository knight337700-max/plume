import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductMatchingScreen } from "../src/screens/matching/product-matching-screen.js";

describe("MATCH-01 product matching contract fixture", () => {
  it("does not auto-confirm the top candidate and exposes alternate paths", () => {
    const html = renderToStaticMarkup(createElement(ProductMatchingScreen, {
      sourceProductCount: 3,
      candidates: [{ candidateId: "candidate-1", sourceProduct: "Source product", candidate: "Top candidate", score: 98, reason: "Strong match", isUserConfirmed: false }],
      onConfirm: () => undefined,
      onExclude: () => undefined,
      onCreateNew: () => undefined,
    }));
    expect(html).toContain('data-screen-id="MATCH-01"');
    expect(html).toContain("AI recommendation · 98%");
    expect(html).toContain("User confirmation: Not confirmed");
    expect(html).toContain("Confirm product");
    expect(html).toContain("Exclude candidate");
    expect(html).toContain("Create new product");
  });
});
