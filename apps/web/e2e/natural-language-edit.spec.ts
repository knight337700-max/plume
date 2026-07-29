import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiEditPanel } from "../src/features/editor/ai-edit-panel.js";
import { canApplyOperation } from "../src/features/editor/operation-preview.js";

describe("AI natural-language edit contract fixture", () => {
  const operation = {
    id: "operation-1",
    kind: "copy_edit" as const,
    summary: "Replace the headline with a concise summer promotion.",
    before: "Summer sale",
    after: "Summer savings start now",
    impact: "high" as const,
    status: "proposed" as const,
  };

  it("shows before/after and never enables apply before confirmation", () => {
    const html = renderToStaticMarkup(
      createElement(AiEditPanel, {
        selectedElementId: "title-1",
        prompt: "Make the headline more concise",
        state: "preview_ready",
        operation,
        onConfirmOperation: () => undefined,
        onApplyOperation: () => undefined,
      }),
    );

    expect(canApplyOperation(operation)).toBe(false);
    expect(html).toContain('data-preview-state="before"');
    expect(html).toContain('data-preview-state="after"');
    expect(html).toContain("Summer sale");
    expect(html).toContain("Summer savings start now");
    expect(html).toContain("High-impact change");
    expect(html).toContain("Confirm operation");
    expect(html).toContain("Confirm this operation before applying it.");
    expect(html).toContain("disabled");
  });

  it("enables apply only after the user confirms the operation", () => {
    const confirmedOperation = { ...operation, status: "confirmed" as const };
    const html = renderToStaticMarkup(
      createElement(AiEditPanel, {
        selectedElementId: "title-1",
        prompt: "Make the headline more concise",
        state: "preview_ready",
        operation: confirmedOperation,
        onApplyOperation: () => undefined,
      }),
    );

    expect(canApplyOperation(confirmedOperation)).toBe(true);
    expect(html).toContain('data-operation-status="confirmed"');
    expect(html).toContain("Apply operation");
    expect(html).not.toContain("Confirm this operation before applying it.");
  });
});
