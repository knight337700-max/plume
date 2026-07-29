import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ApprovalStatusPanel,
  AssetRecommendationCard,
  ChannelSelectionCard,
  ExportPackageSummary,
  FormatProfileCard,
  ProductMatchCard,
  ValidationIssueCard,
} from "./index.js";

describe("domain composites", () => {
  it("renders channel and format selection states with blockers", () => {
    const html = renderToStaticMarkup(
      <>
        <ChannelSelectionCard
          id="kakao"
          label="Kakao Bizboard"
          description="Display channel"
          supportRange="Web and mobile"
          activeFormatCount={2}
          validationStatus="passed"
          isSelected
          onChange={() => undefined}
        />
        <FormatProfileCard
          id="pending-format"
          label="Pending format"
          ratio="4:1"
          width={1029}
          height={258}
          requirements="PNG, 2 MB"
          status="PENDING_VERIFY"
          isSelected={false}
          onChange={() => undefined}
        />
      </>,
    );

    expect(html).toContain('data-plume-composite="channel-selection-card"');
    expect(html).toContain("Kakao Bizboard");
    expect(html).toContain('data-format-status="PENDING_VERIFY"');
    expect(html).toContain("Pending verification");
    expect(html).toContain("cannot be selected yet");
    expect(html).toContain("disabled=\"\"");
  });

  it("keeps AI recommendation and user confirmation distinct", () => {
    const html = renderToStaticMarkup(
      <>
        <ProductMatchCard
          sourceProduct="Raw product"
          candidate="Candidate product"
          score={92}
          reason="Name and category match"
          isUserConfirmed={false}
          onConfirm={() => undefined}
        />
        <AssetRecommendationCard
          id="asset-1"
          label="Hero image"
          product="Candidate product"
          aiReason="Matches the selected ratio"
          risk="License expires soon"
          state="recommended"
          isSelected={false}
          onChange={() => undefined}
        />
      </>,
    );

    expect(html).toContain("AI recommendation · 92%");
    expect(html).toContain("User confirmation: Not confirmed");
    expect(html).toContain("AI reason: Name and category match");
    expect(html).toContain("License expires soon");
  });

  it("renders validation, approval, and export blockers", () => {
    const html = renderToStaticMarkup(
      <>
        <ValidationIssueCard
          id="issue-1"
          severity="error"
          target="headline"
          message="Text exceeds the safe area."
          suggestedFix="Reduce font size"
          onFix={() => undefined}
        />
        <ApprovalStatusPanel
          version="v3"
          status="pending"
          errorCount={1}
          warningCount={0}
          onApprove={() => undefined}
        />
        <ExportPackageSummary
          version="v3"
          eligibility="blocked"
          fileNaming="campaign_v3"
          files={[{ name: "manifest.json", kind: "manifest" }]}
          blockerReason="Validation errors must be resolved."
          onCreateExport={() => undefined}
        />
      </>,
    );

    expect(html).toContain("Text exceeds the safe area.");
    expect(html).toContain("Approval blocked");
    expect(html).toContain('data-export-eligibility="blocked"');
    expect(html).toContain("Validation errors must be resolved.");
    expect(html).toContain("disabled=\"\"");
  });
});
