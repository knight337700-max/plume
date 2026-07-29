import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssetLibraryScreen } from "../src/screens/asset/asset-library-screen.js";
import { ProductDetailScreen } from "../src/screens/product/product-detail-screen.js";
import { ProductListScreen } from "../src/screens/product/product-list-screen.js";
import { createUploadFileProgress, updateUploadFileProgress } from "../src/features/upload/upload-controller.js";

describe("PROD and ASSET screen contract fixture", () => {
  it("keeps file-level upload progress and partial import failures visible", () => {
    const queued = createUploadFileProgress({ id: "file-1", filename: "hero.png", totalBytes: 1000 });
    const uploading = updateUploadFileProgress(queued, 500);
    const html = [
      renderToStaticMarkup(createElement(ProductListScreen, { state: "partial_error", importFailures: ["Row 3: missing SKU"] })),
      renderToStaticMarkup(createElement(ProductDetailScreen, { product: { id: "p-1", name: "Product", assetCount: 1 } })),
      renderToStaticMarkup(createElement(AssetLibraryScreen, { files: [uploading] })),
    ].join("\n");
    expect(html).toContain('data-screen-id="PROD-01"');
    expect(html).toContain('data-screen-id="PROD-02"');
    expect(html).toContain('data-screen-id="ASSET-01"');
    expect(html).toContain("Row 3: missing SKU");
    expect(html).toContain("500 / 1000 bytes");
    expect(html).toContain("50% · uploading");
  });
});
