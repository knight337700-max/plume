import { describe, expect, it } from "vitest";
import {
  readRendererVendorSourceLock,
  RENDERER_VENDOR_DIGEST_MISMATCH,
  verifyRendererVendorIntegrity,
  type RendererVendorSourceLock,
} from "./verify-renderer-vendor.js";

describe("renderer vendor integrity", () => {
  it("verifies the frozen source inventory and rejects a digest mismatch", async () => {
    await expect(verifyRendererVendorIntegrity()).resolves.toBeUndefined();
    const lock = await readRendererVendorSourceLock();
    const first = lock.files[0];
    expect(first).toBeDefined();
    if (!first) return;
    const mismatched: RendererVendorSourceLock = {
      ...lock,
      files: [{ ...first, sha256: "0".repeat(64) }, ...lock.files.slice(1)],
    };
    await expect(verifyRendererVendorIntegrity({ lock: mismatched })).rejects.toMatchObject({
      code: RENDERER_VENDOR_DIGEST_MISMATCH,
    });
  });
});
