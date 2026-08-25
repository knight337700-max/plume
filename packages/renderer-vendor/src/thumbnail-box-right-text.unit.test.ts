import { describe, expect, it, vi } from "vitest";

describe("Thumbnail Box Right font registration", () => {
  it("fails closed when the real font registration path returns false", async () => {
    vi.resetModules();
    const registerFromPath = vi.fn(() => false);
    vi.doMock("@napi-rs/canvas", async () => {
      const actual = await vi.importActual<typeof import("@napi-rs/canvas")>("@napi-rs/canvas");
      const globalFonts = new Proxy(actual.GlobalFonts, {
        get(target, property, receiver) {
          if (property === "registerFromPath") return registerFromPath;
          return Reflect.get(target, property, receiver);
        },
      });
      return { ...actual, GlobalFonts: globalFonts };
    });

    try {
      const { validateThumbnailBoxRightText } = await import("./thumbnail-box-right-text.js");
      await expect(
        validateThumbnailBoxRightText({
          headline: "자코모 프리미엄 소파",
          subcopy: "거실을 바꾸는 선택",
        }),
      ).rejects.toMatchObject({
        name: "ThumbnailBoxRightTextValidationError",
        code: "CANONICAL_THUMBNAIL_FONT_REGISTRATION_FAILED",
      });
      expect(registerFromPath).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("@napi-rs/canvas");
      vi.resetModules();
    }
  });
});
