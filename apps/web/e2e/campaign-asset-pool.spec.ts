import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignAssetPoolScreen } from "../src/screens/asset/campaign-asset-pool-screen.js";

describe("ASSET-02 campaign asset pool contract fixture", () => {
  it("renders product tabs, license risk filters, and selected count", () => {
    const html = renderToStaticMarkup(createElement(CampaignAssetPoolScreen, {
      products: [{ id: "p-1", label: "Product one" }, { id: "p-2", label: "Product two" }],
      activeProductId: "p-1",
      licenseRiskFilter: "all",
      selectedAssetIds: ["asset-1"],
      assets: [{ id: "asset-1", label: "Hero", product: "Product one", aiReason: "Ratio match", state: "recommended", isSelected: true, onChange: () => undefined, productId: "p-1", licenseRisk: "high" }],
    }));
    expect(html).toContain('data-screen-id="ASSET-02"');
    expect(html).toContain("Product one");
    expect(html).toContain("High risk");
    expect(html).toContain("License risks need review");
    expect(html).toContain("1 selected");
    expect(html).toContain("Selected assets: 1");
  });
});
