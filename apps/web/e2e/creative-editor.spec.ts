import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client.js";
import { CreativeEditorScreen } from "../src/screens/editor/creative-editor-screen.js";
import { classifyAutosaveError } from "../src/features/editor/use-autosave.js";
import type { CreativeDocument } from "../src/features/editor/canvas/scene-adapter.js";

const documentFixture: CreativeDocument = {
  id: "creative-document-1",
  width: 1200,
  height: 800,
  elements: [
    {
      id: "title-1",
      type: "text",
      bounds: { x: 80, y: 120, width: 480, height: 80 },
      text: "Campaign headline",
    },
  ],
};

describe("EDITOR-01 creative editor contract fixture", () => {
  it("renders four regions and scene selection at desktop widths", () => {
    const html = renderToStaticMarkup(
      createElement(CreativeEditorScreen, {
        document: documentFixture,
        creatives: [{ id: "creative-1", label: "Headline variant", status: "Draft" }],
        selectedCreativeId: "creative-1",
        selectedElementIds: ["title-1"],
        revision: 7,
        renderState: "ready",
        validationState: "passed",
      }),
    );

    expect(html).toContain('data-screen-id="EDITOR-01"');
    expect(html).toContain('data-editor-layout="four-region"');
    expect(html).toContain('data-editor-supported-widths="1440,1280"');
    expect(html).toContain('data-plume-region="creative-list-panel"');
    expect(html).toContain('data-plume-region="canvas-workspace"');
    expect(html).toContain('data-plume-region="context-inspector"');
    expect(html).toContain('data-plume-region="editor-footer"');
    expect(html).toContain('data-selection-handle-for="title-1"');
    expect(html).toContain("Revision 7");
  });

  it("exposes recovery actions for an If-Match conflict", () => {
    const conflict = classifyAutosaveError(
      new ApiError({
        type: "https://plume.dev/problems/version-conflict",
        title: "Version conflict",
        status: 409,
        code: "VERSION_CONFLICT",
        detail: "The creative was updated by another user.",
      }),
    );
    const html = renderToStaticMarkup(
      createElement(CreativeEditorScreen, {
        document: documentFixture,
        autosaveOverride: {
          state: conflict.state,
          revision: 7,
          error: conflict.message,
          retry: async () => undefined,
          reload: () => undefined,
        },
      }),
    );

    expect(conflict.state).toBe("conflict");
    expect(html).toContain("If-Match conflict");
    expect(html).toContain("Reload latest version");
    expect(html).toContain("Retry save");
  });
});
