import { describe, expect, it } from "vitest";
import { selectPrimaryRender, type CreativeRenderRecord } from "./contracts";

function render(
  id: string,
  renderPurpose: string,
  status: CreativeRenderRecord["status"],
  createdAt: string,
): CreativeRenderRecord {
  return {
    id,
    creativeVersionId: "version-1",
    renderPurpose,
    status,
    createdAt,
  };
}

describe("selectPrimaryRender", () => {
  it("selects the newest completed PREVIEW before a newer FINAL_EXPORT", () => {
    const selected = selectPrimaryRender([
      render("final-new", "FINAL_EXPORT", "COMPLETED", "2026-08-29T12:00:00.000Z"),
      render("preview-old", "PREVIEW", "COMPLETED", "2026-08-29T10:00:00.000Z"),
      render("preview-new", "PREVIEW", "COMPLETED", "2026-08-29T11:00:00.000Z"),
    ]);
    expect(selected?.id).toBe("preview-new");
  });

  it("falls back to the newest completed FINAL_EXPORT and ignores failures", () => {
    const selected = selectPrimaryRender([
      render("preview-failed", "PREVIEW", "FAILED", "2026-08-29T13:00:00.000Z"),
      render("final-old", "FINAL_EXPORT", "COMPLETED", "2026-08-29T10:00:00.000Z"),
      render("final-new", "FINAL_EXPORT", "COMPLETED", "2026-08-29T11:00:00.000Z"),
    ]);
    expect(selected?.id).toBe("final-new");
  });

  it("fails closed when no supported completed purpose exists", () => {
    expect(
      selectPrimaryRender([
        render("thumbnail", "THUMBNAIL", "COMPLETED", "2026-08-29T11:00:00.000Z"),
      ]),
    ).toBeUndefined();
  });
});
