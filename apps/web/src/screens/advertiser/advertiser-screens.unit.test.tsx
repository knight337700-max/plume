import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdvertiserListScreen } from "./advertiser-list-screen.js";
import { BrandOverviewScreen } from "./brand-overview-screen.js";
import { CampaignListScreen } from "../campaign/campaign-list-screen.js";

describe("advertiser, brand, and campaign screens", () => {
  it("renders cursor pages and empty states", () => {
    const html = renderToStaticMarkup(
      <>
        <AdvertiserListScreen items={[{ id: "adv-1", name: "Acme", brandCount: 2 }]} nextCursor="next" canCreate onNext={() => undefined} />
        <BrandOverviewScreen brand={{ id: "brand-1", name: "Brand", advertiserId: "adv-1", productCount: 4 }} />
        <CampaignListScreen items={[{ id: "camp-1", name: "Launch", status: "DRAFT", currentStep: "BRIEF" }]} nextCursor="next" canCreate onNext={() => undefined} />
      </>,
    );
    expect(html).toContain('data-screen-id="ADV-01"');
    expect(html).toContain('data-screen-id="ADV-02"');
    expect(html).toContain('data-screen-id="CAMP-01"');
    expect(html).toContain("Next page");
    expect(html).toContain("New advertiser");
    expect(html).toContain("New campaign");
    expect(html).toContain("Launch");
    expect(renderToStaticMarkup(<AdvertiserListScreen state="empty" />)).toContain("No advertisers");
  });

  it("hides role-restricted actions when permission is absent", () => {
    const html = renderToStaticMarkup(<BrandOverviewScreen brand={{ id: "b", name: "Brand", advertiserId: "a", productCount: 0 }} canEdit={false} />);
    expect(html).not.toContain("Edit brand");
  });
});
